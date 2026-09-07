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
  const coinciden = pa.filter(p => pb.includes(p)).length;
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

function limpiarBase64(v: string) {
  return String(v || "").replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
}

function bytesDeBase64(b64: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function ocr(base: string, token: string, ruta: string, image: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${base}${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
      signal: controller.signal,
    });
    const texto = await res.text();
    let data: any = null;
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
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
    const frente = limpiarBase64(body?.frente ?? body?.obverse ?? "");
    const reverso = limpiarBase64(body?.reverso ?? body?.reverse ?? "");
    if (!frente || !reverso) return json({ error: "Necesitamos la foto del frente y del reverso de tu INE." }, 400);

    const peso = (b: string) => Math.floor((b.length * 3) / 4);
    for (const [nombre, img] of [["frente", frente], ["reverso", reverso]] as const) {
      const kb = peso(img) / 1024;
      if (kb < 150) return json({ error: `La foto del ${nombre} está muy borrosa o muy pequeña. Tómala otra vez llenando el recuadro.` }, 400);
      if (kb > 5120) return json({ error: `La foto del ${nombre} pesa más de 5 MB. Usa una foto más ligera.` }, 400);
    }

    const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";
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
    const { data: curpRenapo } = await admin.rpc("qard_dec" as any, { _v: (ident as any).curp_enc });
    const nombreRenapo = (ident as any).nombre_completo ?? "";

    // Guardamos las fotos en el bucket privado (solo auditoría CNBV/UIF)
    let urlFrente: string | null = null;
    let urlReverso: string | null = null;
    try {
      const sello = Date.now();
      const subir = async (nombre: string, b64: string) => {
        const ruta = `${userId}/${sello}-${nombre}.jpg`;
        const { error } = await admin.storage.from("ine-documentos")
          .upload(ruta, bytesDeBase64(b64), { contentType: "image/jpeg", upsert: true });
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

    let ob: Awaited<ReturnType<typeof ocr>>;
    let rev: Awaited<ReturnType<typeof ocr>>;
    try {
      [ob, rev] = await Promise.all([
        ocr(base, token, "/v1/ocr/obverse", frente),
        ocr(base, token, "/v1/ocr/reverse", reverso),
      ]);
    } catch (error) {
      const mensaje = error instanceof DOMException && error.name === "AbortError"
        ? "Verificamex tardó demasiado en responder. Intenta nuevamente."
        : "No pudimos comunicarnos con Verificamex. Intenta nuevamente.";
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: 504, mensaje,
      });
      return json({ error: mensaje, intentos_restantes: MAX_INTENTOS - intentos }, 504);
    }

    if (ob.ok && rev.ok) {
      await admin.from("qard_identidad").update({ ocr_intentos: intentos + 1 }).eq("user_id", userId);
      crudo = { obverse: ob.data, reverse: rev.data };
      curpIne = extraerCurp(ob.data) || extraerCurp(rev.data);
      nombreIne = [
        buscar(ob.data, ["nombres", "nombre", "name", "firstname", "givennames"]) ?? "",
        buscar(ob.data, ["primerapellido", "apellidopaterno", "firstsurname", "paternalsurname", "lastname"]) ?? "",
        buscar(ob.data, ["segundoapellido", "apellidomaterno", "secondsurname", "maternalsurname"]) ?? "",
      ].filter(Boolean).join(" ").trim() || (buscar(ob.data, ["nombrecompleto", "fullname"]) ?? "");
    } else {
      const msg = ob.data?.message || rev.data?.message || "No pudimos leer tu INE. Toma las fotos con buena luz y sin reflejos.";
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: ob.ok ? rev.status : ob.status,
        mensaje: String(msg).slice(0, 500),
      });
      return json({ error: msg, intentos_restantes: MAX_INTENTOS - intentos }, 400);
    }

    const curpCoincide = !!curpIne && !!curpRenapo && curpIne === String(curpRenapo).toUpperCase();
    const nombreCoincide = mismoNombre(nombreIne || textoProfundo(ob.data), nombreRenapo);

    if (!curpCoincide && !nombreCoincide) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: 200,
        mensaje: "Los datos de la INE no coinciden con la CURP validada",
      });
      await admin.from("qard_identidad").update({ verificamex_status: "failed" }).eq("user_id", userId);
      return json({
        error: "Los datos de tu INE no coinciden con tu CURP. Puedes intentarlo otra vez o continuar con Nivel 1 ($10).",
        intentos_restantes: MAX_INTENTOS - (intentos + 1),
      }, 400);
    }

    const { data: datosEnc } = await admin.rpc("qard_enc" as any, {
      _v: JSON.stringify({ ine: { curp: curpIne, nombre: nombreIne }, fuente, crudo }),
    });

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

    await admin.from("qard_identidad").update(cambios).eq("user_id", userId);

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
