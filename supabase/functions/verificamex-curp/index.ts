// Verificamex — Validación de CURP contra RENAPO (Nivel 1)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DICC = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const ESTADOS = ["AS","BC","BS","CC","CL","CM","CS","CH","DF","DG","GT","GR","HG","JC","MC","MN","MS","NT","NL","OC","PL","QT","QR","SP","SL","SR","TC","TS","TL","VZ","YN","ZS","NE"];
const CURP_REGEX = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

function validarCurp(curp: string): boolean {
  if (!curp || curp.length !== 18) return false;
  if (!CURP_REGEX.test(curp)) return false;
  if (!ESTADOS.includes(curp.slice(11, 13))) return false;
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const v = DICC.indexOf(curp[i]);
    if (v < 0) return false;
    suma += v * (18 - i);
  }
  return ((10 - (suma % 10)) % 10) === Number(curp[17]);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Busca una llave (en cualquier nivel) dentro de la respuesta de Verificamex. */
function buscar(obj: unknown, llaves: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const kn = k.toLowerCase().replace(/[^a-z]/g, "");
    if (llaves.includes(kn) && (typeof v === "string" || typeof v === "number")) {
      return String(v).trim();
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const r = buscar(v, llaves);
      if (r) return r;
    }
  }
  return null;
}

/** Une nombres y apellidos sin repetir palabras (RENAPO a veces duplica el segundo apellido). */
function unirNombre(partes: (string | null | undefined)[]): string {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const parte of partes) {
    for (const palabra of String(parte ?? "").replace(/\s+/g, " ").trim().split(" ")) {
      if (!palabra) continue;
      const clave = palabra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push(palabra);
    }
  }
  return salida.join(" ");
}

async function hashCurp(curp: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(curp)));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let userId: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!userData?.user) return json({ error: "Sesión inválida" }, 401);
    userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const curp = String(body?.curp ?? "").toUpperCase().replace(/[^A-ZÑ0-9]/g, "");
    if (!validarCurp(curp)) return json({ error: "La CURP no tiene un formato válido (18 caracteres)." }, 400);

    // ---- Candado anti doble verificación: la CURP solo se consulta a RENAPO una vez ----
    const subQrId = typeof body?.sub_qr_id === "string" ? body.sub_qr_id : null;

    if (subQrId) {
      // Sub-QR: si ya está verificada, no consultamos ni cobramos de nuevo.
      const { data: subPrevia } = await admin
        .from("qard_sub_qr").select("id, alias, curp_verificada")
        .eq("id", subQrId).eq("titular_user_id", userId).maybeSingle();
      if (!subPrevia) return json({ error: "No encontramos esa sub-QR en tu cuenta." }, 404);
      if ((subPrevia as any).curp_verificada) {
        return json({ error: `La sub-QR "${(subPrevia as any).alias}" ya estaba verificada. No se cobró nada.` }, 400);
      }
    } else {
      // Cuenta principal: si ya tiene CURP verificada, NO volvemos a llamar a RENAPO.
      const { data: previa } = await admin
        .from("qard_identidad")
        .select("verification_level, nombre_completo, curp_enc, verificamex_curp_validated, verificamex_data_enc")
        .eq("user_id", userId).maybeSingle();

      if (previa?.verificamex_curp_validated) {
        const { data: curpGuardada } = await admin.rpc("qard_dec" as any, { _v: (previa as any).curp_enc });
        if (curpGuardada && String(curpGuardada).toUpperCase() !== curp) {
          return json({ error: "Esta cuenta ya tiene otra CURP verificada. Si necesitas corregirla, escríbenos a hola@todocerca.mx." }, 400);
        }
        // Ya estaba verificada: devolvemos los datos guardados sin pagar otra consulta.
        let personaGuardada: Record<string, unknown> | null = null;
        try {
          const { data: datosDec } = await admin.rpc("qard_dec" as any, { _v: (previa as any).verificamex_data_enc });
          personaGuardada = datosDec ? JSON.parse(String(datosDec)).persona : null;
        } catch { /* si no se puede leer, devolvemos lo mínimo */ }
        const nivelPrevio = Number((previa as any).verification_level ?? 1);
        return json({
          ok: true,
          ya_verificada: true,
          persona: personaGuardada ?? { curp, nombres: "", primerApellido: "", segundoApellido: "", sexo: "", fechaNacimiento: "", entidad: "" },
          verification_level: Math.max(nivelPrevio, 1),
          monthly_limit_udis: nivelPrevio >= 2 ? 3000 : 1000,
        });
      }

      // Y si esa misma CURP ya está verificada en OTRA cuenta, tampoco consultamos ni cobramos.
      const huella = await hashCurp(curp);
      const { data: enOtraCuenta } = await admin
        .from("qard_identidad").select("user_id")
        .eq("curp_hash", huella).neq("user_id", userId).maybeSingle();
      if (enOtraCuenta) {
        return json({ error: "Esta CURP ya está registrada y verificada en otra cuenta. No se cobró nada. Si es tuya, escríbenos a hola@todocerca.mx." }, 400);
      }
    }


    const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";
    const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
    if (!token) return json({ error: "Falta configurar el servicio de verificación." }, 500);

    const res = await fetch(`${base}/v1/scraping/renapo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ curp }),
    });

    const texto = await res.text();
    let data: any = null;
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }

    // Verificamex responde anidado: { data: { citizen: { status, codigo, registros: [...] } } }
    const citizen = data?.data?.citizen ?? data?.citizen ?? null;
    const registro = Array.isArray(citizen?.registros) ? citizen.registros[0] : null;
    const ok = res.ok && (
      registro != null ||
      citizen?.status === true || citizen?.status === "true" ||
      data?.status === true || data?.status === "true" || data?.success === true
    );

    if (!ok) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "curp", exito: false, http_status: res.status,
        mensaje: (data?.message ?? texto).toString().slice(0, 500),
      });
      return json({
        error: data?.message || "No pudimos validar tu CURP en RENAPO. Revisa que esté bien escrita e inténtalo otra vez.",
        detalle: res.status,
      }, 400);
    }

    const fuente = registro ?? data;
    const persona = {
      curp: buscar(fuente, ["curp"]) ?? curp,
      nombres: buscar(fuente, ["nombres", "nombre"]) ?? "",
      primerApellido: buscar(fuente, ["primerapellido", "apellidopaterno"]) ?? "",
      segundoApellido: buscar(fuente, ["segundoapellido", "apellidomaterno"]) ?? "",
      sexo: buscar(fuente, ["sexo", "genero"]) ?? "",
      fechaNacimiento: buscar(fuente, ["fechanacimiento", "fechadenacimiento"]) ?? "",
      entidad: buscar(fuente, ["entidad", "entidadnacimiento", "estadonacimiento"]) ?? "",
    };

    const nombreCompleto = unirNombre([persona.nombres, persona.primerApellido, persona.segundoApellido]);

    const { data: curpEnc } = await admin.rpc("qard_enc" as any, { _v: persona.curp });
    const { data: datosEnc } = await admin.rpc("qard_enc" as any, { _v: JSON.stringify({ persona, raw: data }) });

    // ---- Verificación de una sub-QR familiar (Nivel 1, cobra $20 al titular) ----
    if (subQrId) {
      const nombreEnviado = String(body?.nombre_completo ?? "").trim();
      if (nombreEnviado.length < 5) {
        return json({ error: "Escribe el nombre completo de la persona." }, 400);
      }
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(persona.curp)));
      const curpHash = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data: res, error: errSub } = await admin.rpc("qard_verificar_sub_qr" as any, {
        _sub_qr_id: subQrId,
        _user_id: userId,
        _nombre: nombreCompleto || nombreEnviado,
        _curp_enc: curpEnc,
        _curp_hash: curpHash,
      });

      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "curp_sub_qr", exito: !errSub, http_status: errSub ? 400 : 200,
        mensaje: errSub ? String(errSub.message).slice(0, 500) : "CURP de sub-QR validada en RENAPO",
      });

      if (errSub) return json({ error: errSub.message }, 400);

      const fila = Array.isArray(res) ? (res as any[])[0] : (res as any);
      return json({
        ok: true,
        sub_qr: true,
        persona,
        nombre_renapo: nombreCompleto,
        saldo_wallet: Number(fila?.saldo_wallet ?? 0),
        costo: Number(fila?.costo ?? 20),
      });
    }

    const { data: existente } = await admin
      .from("qard_identidad").select("id, verification_level").eq("user_id", userId).maybeSingle();

    const nivelActual = Number((existente as any)?.verification_level ?? 0);
    const nivel = Math.max(nivelActual, 1);
    const limite = nivel >= 2 ? 3000 : 1000;

    // solo_validar = true: se guarda la validación pero la tarjeta NO se activa todavía
    const soloValidar = body?.solo_validar === true;

    const campos: Record<string, unknown> = {
      user_id: userId,
      nombre_completo: nombreCompleto || null,
      curp_enc: curpEnc,
      verification_level: nivel,
      monthly_limit_udis: limite,
      verificamex_status: "verified",
      verificamex_curp_validated: true,
      verificamex_data_enc: datosEnc,
      verified_at: new Date().toISOString(),
    };
    if (!soloValidar) {
      campos.estado = "active";
      campos.activated_at = new Date().toISOString();
    }

    if (existente) {
      await admin.from("qard_identidad").update(campos).eq("user_id", userId);
    } else {
      await admin.from("qard_identidad").insert(campos);
    }


    await admin.from("verificamex_logs").insert({
      user_id: userId, tipo: "curp", exito: true, http_status: res.status, mensaje: "CURP validada en RENAPO",
    });

    return json({ ok: true, persona, verification_level: nivel, monthly_limit_udis: limite });
  } catch (e) {
    console.error("verificamex-curp error", e);
    if (userId) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "curp", exito: false, mensaje: String((e as Error).message).slice(0, 500),
      });
    }
    return json({ error: "Ocurrió un problema al validar. Inténtalo de nuevo." }, 500);
  }
});
