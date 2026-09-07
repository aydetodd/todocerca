// Verificamex — Lectura de INE (OCR frente y reverso) y comparación con RENAPO (Nivel 2)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function limpiarBase64(v: string) {
  return String(v || "").replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
}

async function ocr(base: string, token: string, ruta: string, image: string) {
  const res = await fetch(`${base}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const texto = await res.text();
  let data: any = null;
  try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
  return { ok: res.ok, status: res.status, data };
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

    // Tamaño aproximado del archivo a partir del base64 (1 MB a 5 MB)
    const peso = (b: string) => Math.floor((b.length * 3) / 4);
    for (const [nombre, img] of [["frente", frente], ["reverso", reverso]] as const) {
      const kb = peso(img) / 1024;
      if (kb < 1024) return json({ error: `La foto del ${nombre} pesa menos de 1 MB. Toma la foto con mejor calidad.` }, 400);
      if (kb > 5120) return json({ error: `La foto del ${nombre} pesa más de 5 MB. Usa una foto más ligera.` }, 400);
    }

    const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";
    const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
    if (!token) return json({ error: "Falta configurar el servicio de verificación." }, 500);

    const { data: ident } = await admin
      .from("qard_identidad")
      .select("verification_level, nombre_completo, curp_enc, verificamex_data_enc")
      .eq("user_id", userId).maybeSingle();

    if (!ident || Number((ident as any).verification_level ?? 0) < 1) {
      return json({ error: "Primero valida tu CURP para poder verificar tu INE." }, 400);
    }

    const { data: curpRenapo } = await admin.rpc("qard_dec" as any, { _v: (ident as any).curp_enc });
    const nombreRenapo = (ident as any).nombre_completo ?? "";

    const [ob, rev] = await Promise.all([
      ocr(base, token, "/v1/ocr/ine-obverse", frente),
      ocr(base, token, "/v1/ocr/ine-reverse", reverso),
    ]);

    if (!ob.ok || !rev.ok) {
      const msg = ob.data?.message || rev.data?.message || "No pudimos leer tu INE. Toma las fotos con buena luz y sin reflejos.";
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: ob.ok ? rev.status : ob.status,
        mensaje: String(msg).slice(0, 500),
      });
      return json({ error: msg }, 400);
    }

    const curpIne = (buscar(ob.data, ["curp"]) ?? buscar(rev.data, ["curp"]) ?? "").toUpperCase();
    const nombreIne = [
      buscar(ob.data, ["nombres", "nombre"]) ?? "",
      buscar(ob.data, ["primerapellido", "apellidopaterno"]) ?? "",
      buscar(ob.data, ["segundoapellido", "apellidomaterno"]) ?? "",
    ].filter(Boolean).join(" ").trim() || (buscar(ob.data, ["nombrecompleto"]) ?? "");

    const curpCoincide = !!curpIne && !!curpRenapo && curpIne === String(curpRenapo).toUpperCase();
    const nombreCoincide = mismoNombre(nombreIne, nombreRenapo);

    if (!curpCoincide && !nombreCoincide) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, http_status: 200,
        mensaje: "Los datos de la INE no coinciden con la CURP validada",
      });
      await admin.from("qard_identidad").update({ verificamex_status: "failed" }).eq("user_id", userId);
      return json({ error: "Los datos de tu INE no coinciden con la CURP que validaste. Revisa las fotos e inténtalo otra vez." }, 400);
    }

    const { data: datosEnc } = await admin.rpc("qard_enc" as any, {
      _v: JSON.stringify({ ine: { curp: curpIne, nombre: nombreIne }, obverse: ob.data, reverse: rev.data }),
    });

    await admin.from("qard_identidad").update({
      verification_level: 2,
      monthly_limit_udis: 3000,
      verificamex_status: "verified",
      verificamex_ine_validated: true,
      verificamex_data_enc: datosEnc,
      verified_at: new Date().toISOString(),
    }).eq("user_id", userId);


    await admin.from("verificamex_logs").insert({
      user_id: userId, tipo: "ine", exito: true, http_status: 200, mensaje: "INE validada y coincidente",
    });

    return json({
      ok: true,
      verification_level: 2,
      monthly_limit_udis: 3000,
      ine: { curp: curpIne, nombre: nombreIne },
    });
  } catch (e) {
    console.error("verificamex-ine error", e);
    if (userId) {
      await admin.from("verificamex_logs").insert({
        user_id: userId, tipo: "ine", exito: false, mensaje: String((e as Error).message).slice(0, 500),
      });
    }
    return json({ error: "Ocurrió un problema al validar tu INE. Inténtalo de nuevo." }, 500);
  }
});
