// STP · Webhook público de depósitos SPEI a la CLABE maestra de TodoCerca.
// Lee el concepto, identifica la QaRd de 16 dígitos y acredita el saldo del usuario.
// Idempotente por clave de rastreo. Devuelve 200 siempre que el aviso quedó registrado.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-stp-signature, stp-signature",
};

const SYSTEM = "00000000-0000-0000-0000-000000000001";

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

async function firmaValida(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("STP_WEBHOOK_SECRET");
  if (!secret) return false; // sin secreto configurado no podemos validar
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const recibido = header.replace(/^sha256=/i, "").trim().toLowerCase();
  if (recibido.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ recibido.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const raw = await req.text();

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw || "{}"); } catch { payload = {}; }

  const sigHeader = req.headers.get("x-stp-signature") ?? req.headers.get("stp-signature");
  const valida = await firmaValida(raw, sigHeader);
  const exigirFirma = !!Deno.env.get("STP_WEBHOOK_SECRET");

  const registrarLog = async (resultado: string, depositoId: string | null = null) => {
    try {
      await admin.from("stp_webhook_log").insert({
        deposito_id: depositoId, firma_valida: valida, ip, payload, resultado,
      });
    } catch (e) { console.error("[STP-WEBHOOK] log", e); }
  };

  // Lista blanca opcional de IPs de STP (separadas por coma en STP_IPS_PERMITIDAS)
  const whitelist = (Deno.env.get("STP_IPS_PERMITIDAS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (whitelist.length && ip && !whitelist.includes(ip)) {
    await registrarLog(`ip_no_permitida:${ip}`);
    return new Response(JSON.stringify({ ok: false, error: "IP no permitida" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (exigirFirma && !valida) {
    await registrarLog("firma_invalida");
    console.error("[STP-WEBHOOK] firma inválida");
    return new Response(JSON.stringify({ ok: false, error: "Firma inválida" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // STP puede envolver el aviso en distintas formas
  const body = (payload.abono ?? payload.data ?? payload) as Record<string, unknown>;

  const claveRastreo = String(pick(body, ["claveRastreo", "clave_rastreo", "clave_de_rastreo", "trackingKey", "spei_tracking_key"]) ?? "");
  const monto = Number(pick(body, ["monto", "amount", "importe", "monto_mxn"]) ?? 0);
  const concepto = String(pick(body, ["conceptoPago", "concepto", "conceptoPago1", "referencia", "reference", "descripcion"]) ?? "");
  const clabeDestino = String(pick(body, ["cuentaBeneficiario", "clabe_destino", "cuentaBeneficiarioCLABE"]) ?? "") || null;
  const clabeOrdenante = String(pick(body, ["cuentaOrdenante", "clabe_ordenante"]) ?? "") || null;
  const nombreOrdenante = String(pick(body, ["nombreOrdenante", "ordenante", "nombre_ordenante"]) ?? "") || null;
  const bancoOrdenante = String(pick(body, ["institucionOrdenante", "banco_ordenante", "nombreInstitucionOrdenante"]) ?? "") || null;

  // La CLABE maestra debe coincidir con la configurada (si viene en el aviso)
  const clabeMaestra = Deno.env.get("STP_CLABE_MAESTRA");
  if (clabeMaestra && clabeDestino && clabeDestino !== clabeMaestra) {
    await registrarLog(`clabe_destino_desconocida:${clabeDestino}`);
    return new Response(JSON.stringify({ ok: false, error: "CLABE destino desconocida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await admin.rpc("stp_procesar_deposito", {
    _clave_rastreo: claveRastreo,
    _monto: monto,
    _concepto: concepto,
    _clabe_destino: clabeDestino,
    _clabe_ordenante: clabeOrdenante,
    _nombre_ordenante: nombreOrdenante,
    _banco_ordenante: bancoOrdenante,
    _payload: payload,
  });

  if (error) {
    await registrarLog(`error:${error.message}`);
    console.error("[STP-WEBHOOK] error al procesar", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = data as Record<string, unknown>;
  await registrarLog(JSON.stringify(res).slice(0, 500), (res?.deposito_id as string) ?? null);

  // Aviso al usuario en su buzón
  try {
    if (res?.ok === true && !res?.duplicado && res?.user_id) {
      await admin.from("messages").insert({
        sender_id: SYSTEM,
        receiver_id: res.user_id as string,
        message: `💰 Recibiste $${Number(res.monto).toFixed(2)} en tu QaRd por transferencia SPEI.\nSaldo actual: $${Number(res.saldo).toFixed(2)}`,
        is_panic: false,
        is_read: false,
      });
    }
    // Alerta al administrador cuando el depósito no se pudo acreditar
    if (res?.ok === false) {
      const { data: adminProf } = await admin
        .from("profiles").select("user_id").eq("consecutive_number", 1).maybeSingle();
      if (adminProf?.user_id) {
        await admin.from("messages").insert({
          sender_id: SYSTEM,
          receiver_id: adminProf.user_id,
          message: `⚠️ Depósito SPEI sin acreditar (${res.motivo}). Clave de rastreo: ${claveRastreo}. Monto: $${monto.toFixed(2)}. Concepto: "${concepto}". Requiere revisión manual.`,
          is_panic: false,
          is_read: false,
        });
      }
    }
  } catch (e) { console.error("[STP-WEBHOOK] notificación", e); }

  console.log("[STP-WEBHOOK]", claveRastreo, JSON.stringify(res));

  // 200 siempre que el aviso quedó registrado: evita reintentos infinitos de STP
  return new Response(JSON.stringify({ ok: true, resultado: res }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
