// Verifica el código SMS y registra el dispositivo como confiable
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuario no encontrado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const deviceFingerprint: string = body.device_fingerprint;
    const deviceName: string = body.device_name || "Móvil";
    const deviceType: string = body.device_type || "mobile";
    const userAgent: string = body.user_agent || "";
    const code: string = (body.code || "").toString().trim();

    if (!deviceFingerprint || !code || code.length !== 6) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar código activo
    const { data: codeRow } = await supabase
      .from("device_verification_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("device_fingerprint", deviceFingerprint)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!codeRow) {
      return new Response(JSON.stringify({ error: "Código expirado o no solicitado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (codeRow.attempts >= 5) {
      await supabase
        .from("device_verification_codes")
        .update({ used: true })
        .eq("id", codeRow.id);
      return new Response(JSON.stringify({ error: "Demasiados intentos. Solicita un nuevo código." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (codeRow.code !== code) {
      await supabase
        .from("device_verification_codes")
        .update({ attempts: codeRow.attempts + 1 })
        .eq("id", codeRow.id);
      return new Response(JSON.stringify({ error: "Código incorrecto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marcar código como usado
    await supabase
      .from("device_verification_codes")
      .update({ used: true })
      .eq("id", codeRow.id);

    // Registrar dispositivo de confianza (upsert)
    const { error: upsertErr } = await supabase
      .from("trusted_devices")
      .upsert({
        user_id: user.id,
        device_fingerprint: deviceFingerprint,
        device_name: deviceName,
        device_type: deviceType,
        user_agent: userAgent,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,device_fingerprint" });

    if (upsertErr) {
      console.error("upsert err", upsertErr);
      return new Response(JSON.stringify({ error: "No se pudo registrar el dispositivo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("verify-device err", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
