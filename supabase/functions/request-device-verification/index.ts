// Solicita un código SMS para autorizar un dispositivo móvil nuevo
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
    const deviceName: string = body.device_name || "Dispositivo móvil";

    if (!deviceFingerprint || deviceFingerprint.length < 10) {
      return new Response(JSON.stringify({ error: "Fingerprint inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener teléfono del perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("telefono, nombre, apodo")
      .eq("user_id", user.id)
      .single();

    if (!profile?.telefono) {
      return new Response(JSON.stringify({
        error: "No tienes un teléfono registrado en tu perfil. Contacta soporte."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar código (invalidar previos)
    await supabase
      .from("device_verification_codes")
      .update({ used: true })
      .eq("user_id", user.id)
      .eq("device_fingerprint", deviceFingerprint)
      .eq("used", false);

    const { error: insertErr } = await supabase
      .from("device_verification_codes")
      .insert({
        user_id: user.id,
        device_fingerprint: deviceFingerprint,
        code,
        phone: profile.telefono,
      });

    if (insertErr) {
      console.error("insert code err", insertErr);
      return new Response(JSON.stringify({ error: "No se pudo generar el código" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enviar SMS via Twilio
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !from) {
      console.error("Twilio no configurado");
      return new Response(JSON.stringify({ error: "SMS no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toPhone = profile.telefono.startsWith("+") ? profile.telefono : `+52${profile.telefono.replace(/\D/g, "")}`;
    const smsBody = `TodoCerca: Tu código para autorizar un dispositivo nuevo (${deviceName}) es: ${code}. Vence en 10 minutos. Si no fuiste tú, ignora este mensaje y cambia tu contraseña.`;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: toPhone, From: from, Body: smsBody }),
      }
    );

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      console.error("Twilio err:", errText);
      return new Response(JSON.stringify({ error: "No se pudo enviar el SMS" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Devolver teléfono enmascarado
    const masked = toPhone.slice(0, -4).replace(/\d/g, "•") + toPhone.slice(-4);

    return new Response(JSON.stringify({ success: true, phone_masked: masked }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("request-device-verification err", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
