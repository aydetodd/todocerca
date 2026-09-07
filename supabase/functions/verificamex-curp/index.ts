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

    const ok = res.ok && (data?.status === true || data?.status === "true" || data?.success === true);

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

    const persona = {
      curp: buscar(data, ["curp"]) ?? curp,
      nombres: buscar(data, ["nombres", "nombre"]) ?? "",
      primerApellido: buscar(data, ["primerapellido", "apellidopaterno"]) ?? "",
      segundoApellido: buscar(data, ["segundoapellido", "apellidomaterno"]) ?? "",
      sexo: buscar(data, ["sexo", "genero"]) ?? "",
      fechaNacimiento: buscar(data, ["fechanacimiento", "fechadenacimiento"]) ?? "",
      entidad: buscar(data, ["entidad", "entidadnacimiento", "estadonacimiento"]) ?? "",
    };

    const nombreCompleto = [persona.nombres, persona.primerApellido, persona.segundoApellido]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const { data: curpEnc } = await admin.rpc("qard_enc" as any, { _v: persona.curp });
    const { data: datosEnc } = await admin.rpc("qard_enc" as any, { _v: JSON.stringify({ persona, raw: data }) });

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
