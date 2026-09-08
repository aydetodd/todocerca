// Verificamex — Lectura de INE (OCR frente y reverso) y comparación con RENAPO (Nivel 2)
// Rutas oficiales: POST /v1/ocr/obverse y POST /v1/ocr/reverse (5 tokens cada una)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INTENTOS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buscar(obj: unknown, llaves: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const kn = k.toLowerCase().replace(/[^a-z]/g, "");
    if (llaves.includes(kn) && (typeof v === "string" || typeof v === "number")) return String(v).trim();
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const r = buscar(v, llaves);
      if (r) return r;
    }
  }
  return null;
}

/** Verificamex entrega los campos OCR como [{ Name, Type, Value, Source }]. */
function buscarPorTipo(obj: unknown, tipos: string[]): string | null {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object") {
        const registro = item as Record<string, unknown>;
        const tipo = String(registro.Type ?? registro.type ?? "").toLowerCase();
        const nombre = String(registro.Name ?? registro.name ?? "").toLowerCase();
        const valor = registro.Value ?? registro.value;
        if (tipos.includes(tipo) || tipos.includes(nombre)) {
          if (typeof valor === "string" || typeof valor === "number") return String(valor).trim();
        }
      }
      const anidado = buscarPorTipo(item, tipos);
      if (anidado) return anidado;
    }
    return null;
  }
  if (obj && typeof obj === "object") {
    for (const valor of Object.values(obj as Record<string, unknown>)) {
      const anidado = buscarPorTipo(valor, tipos);
      if (anidado) return anidado;
    }
  }
  return null;
}

function esRespuestaOcr(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const texto = JSON.stringify(obj);
  if (/"(DocumentData|documentData|parse_ocr|ocr|mrz)"\s*:/.test(texto)) return true;
  // Algunas respuestas envuelven los campos sin conservar el nombre DocumentData.
  // Aceptamos únicamente arreglos con la estructura real Name/Type/Value para no
  // confundir nuevamente la página de bienvenida con una lectura OCR.
  const contieneCamposOcr = (valor: unknown): boolean => {
    if (Array.isArray(valor)) {
      return valor.some((item) => {
        if (!item || typeof item !== "object") return contieneCamposOcr(item);
        const registro = item as Record<string, unknown>;
        const tieneEtiqueta = "Name" in registro || "name" in registro || "Type" in registro || "type" in registro;
        const tieneValor = "Value" in registro || "value" in registro;
        return (tieneEtiqueta && tieneValor) || contieneCamposOcr(item);
      });
    }
    if (valor && typeof valor === "object") {
      return Object.values(valor as Record<string, unknown>).some(contieneCamposOcr);
    }
    return false;
  };
  return contieneCamposOcr(obj);
}

/** Normaliza para comparar nombres: sin acentos, sin comas, mayúsculas. */
function norm(s: string) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-ZÑ0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function mismoNombre(a: string, b: string) {
  const pa = norm(a).split(" ").filter(p => p.length > 2);
  const pb = norm(b).split(" ").filter(p => p.length > 2);
  if (!pa.length || !pb.length) return false;
  const coinciden = [...new Set(pa)].filter(p => pb.includes(p)).length;
  return coinciden >= Math.min(2, Math.min(pa.length, pb.length));
}

function textoProfundo(obj: unknown): string {
  if (typeof obj === "string" || typeof obj === "number") return String(obj);
  if (Array.isArray(obj)) return obj.map(textoProfundo).join(" ");
  if (obj && typeof obj === "object") return Object.values(obj as Record<string, unknown>).map(textoProfundo).join(" ");
  return "";
}

function extraerCurp(obj: unknown): string {
  const directa = buscar(obj, ["curp"]);
  if (directa) return directa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return textoProfundo(obj).toUpperCase().match(/[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/)?.[0] ?? "";
}

function normalizarCurp(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-ZÑ0-9]/g, "");
}

/** El OCR suele confundir O/0, I/1, S/5 y B/8 en las posiciones numéricas de la CURP. */
function corregirCurpOcr(v: string): string {
  const chars = normalizarCurp(v).split("");
  const posicionesNumericas = new Set([4, 5, 6, 7, 8, 9, 17]);
  const aNumero: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
  return chars.map((c, i) => posicionesNumericas.has(i) ? (aNumero[c] ?? c) : c).join("");
}

function curpVisibleEnOcr(obj: unknown, curpEsperada: string): boolean {
  const esperada = corregirCurpOcr(curpEsperada);
  if (esperada.length !== 18) return false;
  const texto = normalizarCurp(textoProfundo(obj));
  if (texto.includes(esperada)) return true;
  for (let i = 0; i <= texto.length - 18; i++) {
    if (corregirCurpOcr(texto.slice(i, i + 18)) === esperada) return true;
  }
  return false;
}

function normalizarImagen(v: string) {
  const imagen = String(v || "").trim();
  if (!imagen) return "";
  // Verificamex exige el Data URL completo, no solamente los bytes base64.
  return imagen.startsWith("data:image/") ? imagen : `data:image/jpeg;base64,${imagen}`;
}

function base64Puro(v: string) {
  return v.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function bytesDeBase64(b64: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function enviarOcr(base: string, token: string, ruta: string, body: BodyInit, contentTypeJson: boolean) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (contentTypeJson) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${ruta}`, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const texto = await res.text();
    let data: any = null;
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
    const respuestaValida = contentType.toLowerCase().includes("application/json") && esRespuestaOcr(data);
    return { ok: res.ok && respuestaValida, status: res.status, data, respuestaValida, texto };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verificamex ha rechazado los cuerpos JSON con "requiere imagen frontal y trasera".
 * Probamos las formas conocidas del servicio y nos quedamos con la primera que
 * devuelva una lectura OCR real. Los rechazos (400/422) no consumen tokens.
 */
async function pedirOcr(base: string, token: string, ruta: string, frente: string, reverso: string) {
  const frenteB64 = base64Puro(frente);
  const reversoB64 = base64Puro(reverso);

  const multipart = () => {
    const fd = new FormData();
    fd.append("ine_front", new Blob([bytesDeBase64(frenteB64)], { type: "image/jpeg" }), "frente.jpg");
    fd.append("ine_back", new Blob([bytesDeBase64(reversoB64)], { type: "image/jpeg" }), "reverso.jpg");
    return fd;
  };

  const variantes: { nombre: string; body: BodyInit; json: boolean }[] = [
    { nombre: "multipart", body: multipart(), json: false },
    { nombre: "json_b64", body: JSON.stringify({ ine_front: frenteB64, ine_back: reversoB64 }), json: true },
    { nombre: "json_dataurl", body: JSON.stringify({ ine_front: frente, ine_back: reverso }), json: true },
  ];

  let ultimo: Awaited<ReturnType<typeof enviarOcr>> & { variante?: string } = {
    ok: false, status: 0, data: null, respuestaValida: false, texto: "",
  };
  for (const v of variantes) {
    const r = await enviarOcr(base, token, ruta, v.body, v.json);
    ultimo = { ...r, variante: v.nombre };
    if (r.ok) return ultimo;
  }
  return ultimo;
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
    const frente = normalizarImagen(body?.frente ?? body?.obverse ?? "");
    const reverso = normalizarImagen(body?.reverso ?? body?.reverse ?? "");
    if (!frente || !reverso) return json({ error: "Necesitamos la foto del frente y del reverso de tu INE." }, 400);

    const peso = (b: string) => Math.floor((base64Puro(b).length * 3) / 4);
    for (const [nombre, img] of [["frente", frente], ["reverso", reverso]] as const) {
      const kb = peso(img) / 1024;
      if (kb < 150) return json({ error: `La foto del ${nombre} está muy borrosa o muy pequeña. Tómala otra vez llenando el recuadro.` }, 400);
      if (kb > 5120) return json({ error: `La foto del ${nombre} pesa más de 5 MB. Usa una foto más ligera.` }, 400);
    }

    // La API de identidad vive bajo /identity. La ruta anterior sin este prefijo
    // devolvía el sitio web en HTML con HTTP 200 y nunca consumía tokens OCR.
    const base = "https://api.verificamex.com/identity";
    const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
    if (!token) return json({ error: "Falta configurar el servicio de verificación." }, 500);

    const { data: ident } = await admin
      .from("qard_identidad")
      .select("verification_level, nombre_completo, curp_enc, ocr_intentos, account_opening_fee_pending")
      .eq("user_id", userId).maybeSingle();

    if (!ident || Number((ident as any).verification_level ?? 0) < 1) {
      return json({ error: "Primero valida tu CURP para poder verificar tu INE." }, 400);
    }

    const intentos = Number((ident as any).ocr_intentos ?? 0);
    if (intentos >= MAX_INTENTOS) {
      return json({ error: "Ya intentaste validar tu INE 3 veces. Tu cuenta sigue activa en Nivel 1. Escríbenos para ayudarte." }, 429);
    }
    const { data: curpRenapo, error: curpError } = await admin.rpc("qard_dec" as any, { _v: (ident as any).curp_enc });
    if (curpError || !curpRenapo) {
      console.error("[INE] No se pudo recuperar la CURP validada", curpError?.message);
      return json({ error: "No pudimos recuperar tu CURP ya validada. Intenta nuevamente." }, 500);
    }
    const nombreRenapo = (ident as any).nombre_completo ?? "";

    // Guardamos las fotos en el bucket privado (solo auditoría CNBV/UIF)
    let urlFrente: string | null = null;
    let urlReverso: string | null = null;
    try {
      const sello = Date.now();
      const subir = async (nombre: string, b64: string) => {
        const ruta = `${userId}/${sello}-${nombre}.jpg`;
        const { error } = await admin.storage.from("ine-documentos")
          .upload(ruta, bytesDeBase64(base64Puro(b64)), { contentType: "image/jpeg", upsert: true });
        return error ? null : ruta;
      };
      urlFrente = await subir("frente", frente);
      urlReverso = await subir("reverso", reverso);
    } catch (e) { console.error("[INE] guardar fotos", e); }

    // OCR de Verificamex
    let curpIne = "";
    let nombreIne = "";
    let fuente = "verificamex";
    let crudo: unknown = null;

    let ob: Awaited<ReturnType<typeof pedirOcr>>;
    let rev: Awaited<ReturnType<typeof pedirOcr>>;
    try {
      // Aunque las rutas separan frente y reverso, el servicio KYC exige que ambas
      // imágenes viajen juntas. Omitir una produjo el error confirmado HTTP 400.
      const imagenesIne = { ine_front: frente, ine_back: reverso };
      ob = await pedirOcr(base, token, "/v1/ocr/obverse", imagenesIne);
      if (!ob.ok) {
        const detalleServicio = String(ob.data?.message ?? ob.texto ?? "").slice(0, 300);
        await admin.from("verificamex_logs").insert({
          user_id: userId, tipo: "ine", exito: false, http_status: ob.status,
          mensaje: `frente=${ob.status} :: ${detalleServicio}`.slice(0, 500),
        });
        return json({
          error: ob.respuestaValida
            ? (ob.data?.message || "No pudimos leer el frente de tu INE. Toma la foto con buena luz y sin reflejos.")
            : "Verificamex recibió tus fotos, pero no devolvió la lectura del frente. No vuelvas a enviarlas por ahora.",
          intentos_restantes: MAX_INTENTOS - intentos,
        }, ob.respuestaValida ? 400 : 502);
      }
      rev = await pedirOcr(base, token, "/v1/ocr/reverse", imagenesIne);
    } catch (error) {
      const mensaje = error instanceof DOMException && error.name === "AbortError"
        ? "Verificamex tardó demasiado en responder. Intenta nuevamente."
        : "No pudimos comunicarnos con Verificamex. Intenta nuevamente.";
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: 504, mensaje,
      });
      return json({ error: mensaje, intentos_restantes: MAX_INTENTOS - intentos }, 504);
    }

    if (rev.ok) {
      await admin.from("qard_identidad").update({ ocr_intentos: intentos + 1 }).eq("user_id", userId);
      crudo = { obverse: ob.data, reverse: rev.data };
      curpIne = extraerCurp(ob.data) || extraerCurp(rev.data)
        || (buscarPorTipo({ obverse: ob.data, reverse: rev.data }, ["curp"]) ?? "");
      nombreIne = [
        buscarPorTipo(ob.data, ["name", "nombre"]) ?? buscar(ob.data, ["nombres", "nombre", "name", "firstname", "givennames"]) ?? "",
        buscarPorTipo(ob.data, ["fathersurname", "surname", "apellido paterno"]) ?? buscar(ob.data, ["primerapellido", "apellidopaterno", "firstsurname", "paternalsurname", "lastname"]) ?? "",
        buscarPorTipo(ob.data, ["mothersurname", "secondsurname", "apellido materno", "segundo apellido"]) ?? buscar(ob.data, ["segundoapellido", "apellidomaterno", "secondsurname", "maternalsurname"]) ?? "",
      ].filter(Boolean).join(" ").trim() || (buscar(ob.data, ["nombrecompleto", "fullname"]) ?? "");
    } else {
      const respuestaNoOcr = !rev.respuestaValida;
      const detalleServicio = String(rev.data?.message ?? rev.texto ?? "").slice(0, 300);
      const msg = respuestaNoOcr
        ? "Verificamex recibió tus fotos, pero no devolvió una lectura utilizable. No vuelvas a enviarlas por ahora."
        : (ob.data?.message || rev.data?.message || "No pudimos leer tu INE. Toma las fotos con buena luz y sin reflejos.");
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: rev.status,
        mensaje: `frente=${ob.status} reverso=${rev.status} :: ${detalleServicio}`.slice(0, 500),
      });
      return json({ error: msg, intentos_restantes: MAX_INTENTOS - intentos }, respuestaNoOcr ? 502 : 400);
    }

    const respuestaCompleta = { obverse: ob.data, reverse: rev.data };
    const curpEsperada = normalizarCurp(curpRenapo);
    const curpCoincide = corregirCurpOcr(curpIne) === corregirCurpOcr(curpEsperada)
      || curpVisibleEnOcr(respuestaCompleta, curpEsperada);
    // Comparamos contra toda la lectura OCR. Antes un campo genérico llamado "name"
    // podía impedir que se encontrara el nombre real impreso en la credencial.
    const nombreCoincide = mismoNombre(textoProfundo(respuestaCompleta), nombreRenapo);

    if (!curpCoincide && !nombreCoincide) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: 200,
        mensaje: `No coincidió INE/CURP (curp_extraida=${curpIne.length === 18}, curp_coincide=${curpCoincide}, nombre_extraido=${nombreIne.length > 0}, nombre_coincide=${nombreCoincide})`,
      });
      await admin.from("qard_identidad").update({ verificamex_status: "failed" }).eq("user_id", userId);
      return json({
        error: "Los datos de tu INE no coinciden con tu CURP. Puedes intentarlo otra vez o continuar con Nivel 1 ($10).",
        intentos_restantes: MAX_INTENTOS - (intentos + 1),
      }, 400);
    }

    const { data: datosEnc, error: encError } = await admin.rpc("qard_enc" as any, {
      _v: JSON.stringify({ ine: { curp: curpIne, nombre: nombreIne }, fuente, crudo }),
    });
    if (encError || !datosEnc) {
      console.error("[INE] No se pudieron cifrar los datos", encError?.message);
      return json({ error: "La INE fue leída, pero no pudimos guardar la verificación. Intenta nuevamente." }, 500);
    }

    // Solo cobramos los $25 si la apertura sigue pendiente
    const aperturaPendiente = (ident as any).account_opening_fee_pending !== false;
    const cambios: Record<string, unknown> = {
      verification_level: 2,
      monthly_limit_udis: 3000,
      validation_type: "ocr_full",
      verificamex_status: "verified",
      verificamex_ine_validated: true,
      verificamex_data_enc: datosEnc,
      verified_at: new Date().toISOString(),
      ine_front_image_url: urlFrente,
      ine_back_image_url: urlReverso,
    };
    if (aperturaPendiente) cambios.account_opening_fee_amount = 25.00;

    const { data: identidadActualizada, error: updateError } = await admin
      .from("qard_identidad")
      .update(cambios)
      .eq("user_id", userId)
      .select("verification_level, monthly_limit_udis")
      .single();
    if (updateError || Number(identidadActualizada?.verification_level) !== 2) {
      console.error("[INE] No se pudo guardar Nivel 2", updateError?.message);
      return json({ error: "La INE fue validada, pero no pudimos subir tu cuenta a Nivel 2. Intenta nuevamente." }, 500);
    }

    await admin.from("verificamex_logs").insert({
      user_id: userId, tipo: "ine", exito: true, http_status: 200,
      mensaje: `INE validada (${fuente}). Nivel 2, 3000 UDIS.`,
    });

    return json({
      ok: true,
      verification_level: 2,
      monthly_limit_udis: 3000,
      validation_type: "ocr_full",
      costo_apertura: aperturaPendiente ? 25 : 0,
    });
  } catch (e: any) {
    console.error("[verificamex-ine]", e);
    return json({ error: e?.message ?? "Error inesperado al validar tu INE." }, 500);
  }
});
