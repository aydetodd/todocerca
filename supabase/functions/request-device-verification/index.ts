// Solicita un código por CORREO para autorizar el acceso desde este dispositivo
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMITENTE = Deno.env.get("RESEND_FROM") || "TodoCerca <hola@todocerca.mx>";

function plantilla(titulo: string, cuerpoHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px">
    <h2 style="margin:0 0 12px;color:#111">${titulo}</h2>
    ${cuerpoHtml}
    <p style="color:#999;font-size:12px;margin-top:24px">TodoCerca · todocerca.mx</p>
  </div>`;
}

function enmascararCorreo(email: string) {
  const [u, d] = email.split("@");
  if (!d) return email;
  const visible = u.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(u.length - 2, 2))}@${d}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

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
    if (userError || !user) return json({ error: "Usuario no encontrado" }, 401);

    const body = await req.json();
    const deviceFingerprint: string = body.device_fingerprint;
    const deviceName: string = body.device_name || "Este dispositivo";
    const deviceType: string = body.device_type || "mobile";
    const correoManual: string | undefined = (body.email || "").toString().trim() || undefined;

    if (!deviceFingerprint || deviceFingerprint.length < 10) {
      return json({ error: "Fingerprint inválido" }, 400);
    }

    // Correo destino: solo usamos correos reales. Los @todocerca.app son identificadores internos.
    const { data: profile } = await supabase
      .from("profiles")
      .select("telefono, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const candidatos = [correoManual, (profile as any)?.email, user.email]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value.includes("@") && !value.endsWith("@todocerca.app"));
    const destino = candidatos[0] || null;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!destino) return json({ error: "No tienes un correo registrado. Escribe tu correo para recibir el código." }, 400);
    if (!resendKey) return json({ error: "El envío de correos no está configurado. Contacta a soporte@todocerca.mx" }, 500);

    const code = Math.floor(100000 + Math.random() * 900000).toString();

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
        phone: (profile as any)?.telefono || destino,
        destination_email: destino,
      });

    if (insertErr) {
      console.error("insert code err", insertErr);
      return json({ error: "No se pudo generar el código" }, 500);
    }

    const html = plantilla(
      "Confirma que eres tú",
      `<p style="color:#444;margin:0">Estás entrando desde <b>${deviceName}</b>. Usa este código:</p>
       <p style="font-size:34px;font-weight:800;letter-spacing:4px;margin:8px 0">${code}</p>
       <p style="color:#666">Vence en 10 minutos. Al confirmarlo, tu cuenta quedará abierta solo en este dispositivo.</p>`
    );

    const enviar = async (from: string) =>
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [destino],
          reply_to: "soporte@todocerca.mx",
          subject: `Tu código de acceso TodoCerca: ${code}`,
          html,
        }),
      });

    let res = await enviar(REMITENTE);

    // Si el dominio propio aún no está verificado en Resend, usamos el remitente por defecto
    if (!res.ok) {
      const primerError = await res.text();
      console.error("Resend err (remitente propio):", primerError);
      res = await enviar("TodoCerca <onboarding@resend.dev>");
      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend err (fallback):", errText);
        return json({ error: "No se pudo enviar el correo: " + errText }, 502);
      }
    }

    return json({ success: true, email_masked: enmascararCorreo(destino) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("request-device-verification err", msg);
    return json({ error: msg }, 500);
  }
});
