// QaRd — Identidad financiera: verificación de teléfono, correo y datos legales (nombre + CURP)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANAL_OFICIAL = "00000000-0000-0000-0000-000000000001";

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

const REMITENTE = Deno.env.get("RESEND_FROM") || "TodoCerca <m.villa@todocerca.mx>";

async function enviarConRemitente(key: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) console.error(`Resend error (${from})`, res.status, await res.text());
  return res.ok;
}

async function enviarCorreo(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return false;
  try {
    if (await enviarConRemitente(resendKey, REMITENTE, to, subject, html)) return true;
    // Respaldo: remitente de pruebas de Resend (solo llega al dueño de la cuenta)
    return await enviarConRemitente(resendKey, "TodoCerca <onboarding@resend.dev>", to, subject, html);
  } catch (e) {
    console.error("Resend fetch error", e);
    return false;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return json({ error: "No autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const accion: string = body.accion;

    // Asegura fila de identidad
    await admin.from("qard_identidad").upsert(
      { user_id: user.id, estado: "inactive" },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("telefono, email, apodo")
      .eq("user_id", user.id)
      .maybeSingle();

    // ---------- TELÉFONO ----------
    if (accion === "enviar_sms") {
      const telefono = profile?.telefono;
      if (!telefono) return json({ error: "No tienes teléfono registrado en tu perfil." }, 400);

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await admin.from("phone_verification_codes").update({ used: true })
        .eq("user_id", user.id).eq("used", false);
      const { error: insErr } = await admin.from("phone_verification_codes").insert({
        user_id: user.id,
        phone: telefono,
        code,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (insErr) return json({ error: "No se pudo generar el código" }, 500);

      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      const from = Deno.env.get("TWILIO_PHONE_NUMBER");
      let enviado = false;
      if (sid && token && from) {
        const to = telefono.startsWith("+") ? telefono : `+52${telefono.replace(/\D/g, "")}`;
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${sid}:${token}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: to,
            From: from,
            Body: `TodoCerca: tu código para activar tu QaRd es ${code}. Vence en 10 minutos.`,
          }),
        });
        enviado = res.ok;
        if (!res.ok) console.error("Twilio error", await res.text());
      }
      // Respaldo: correo (si el usuario dio uno) + buzón interno
      let correoEnviado = false;
      const correoDestino = String(body.email || profile?.email || user.email || "").trim().toLowerCase();
      if (!enviado && correoDestino.includes("@") && !correoDestino.endsWith("@todocerca.app")) {
        correoEnviado = await enviarCorreo(
          correoDestino,
          "Tu código para activar tu QaRd",
          `<p>Tu código para activar tu QaRd es: <b style="font-size:22px">${code}</b></p><p>Vence en 10 minutos.</p>`,
        );
      }
      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: user.id,
        message: `Tu código para activar tu QaRd es: ${code} (vence en 10 minutos).`,
      });
      return json({ success: true, sms: enviado, correo: correoEnviado, destino: correoEnviado ? correoDestino : null });
    }

    if (accion === "verificar_sms") {
      const code = String(body.code || "").trim();
      const { data: row } = await admin
        .from("phone_verification_codes")
        .select("id")
        .eq("user_id", user.id)
        .eq("code", code)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) return json({ error: "Código inválido o vencido" }, 400);
      await admin.from("phone_verification_codes").update({ used: true }).eq("id", row.id);
      await admin.from("qard_identidad").update({ phone_verified: true }).eq("user_id", user.id);
      await admin.from("profiles").update({ phone_verified: true }).eq("user_id", user.id);
      return json({ success: true });
    }

    // ---------- CORREO ----------
    if (accion === "enviar_correo") {
      const email = String(body.email || profile?.email || user.email || "").trim().toLowerCase();
      if (!email || !email.includes("@") || email.endsWith("@todocerca.app")) {
        return json({ error: "Escribe un correo electrónico válido." }, 400);
      }
      const token = String(Math.floor(100000 + Math.random() * 900000));
      const { error: insErr } = await admin.from("email_verification_tokens").insert({
        user_id: user.id,
        email,
        token: `${user.id.slice(0, 8)}-${token}`,
      });
      if (insErr) return json({ error: "No se pudo generar el token" }, 500);

      await admin.from("profiles").update({ email }).eq("user_id", user.id);

      const enviado = await enviarCorreo(
        email,
        "Código para verificar tu correo — QaRd",
        `<p>Tu código para verificar tu correo es: <b style="font-size:22px">${token}</b></p><p>Vence en 7 días.</p>`,
      );
      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: user.id,
        message: `Código de verificación de tu correo (${email}): ${token}. Vence en 7 días.`,
      });
      return json({ success: true, correo: enviado });
    }

    if (accion === "verificar_correo") {
      const code = String(body.code || "").trim();
      const full = `${user.id.slice(0, 8)}-${code}`;
      const { data: row } = await admin
        .from("email_verification_tokens")
        .select("id, email")
        .eq("user_id", user.id)
        .eq("token", full)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) return json({ error: "Código inválido o vencido" }, 400);
      await admin.from("email_verification_tokens")
        .update({ used_at: new Date().toISOString() }).eq("id", row.id);
      await admin.from("qard_identidad").update({ email_verified: true }).eq("user_id", user.id);
      return json({ success: true });
    }

    // ---------- DATOS LEGALES / ACTIVACIÓN ----------
    if (accion === "activar") {
      const nombre = String(body.nombre_completo || "").trim();
      const curp = String(body.curp || "").toUpperCase().trim();
      if (nombre.length < 5 || nombre.length > 160) {
        return json({ error: "Escribe tu nombre completo tal como aparece en tu identificación." }, 400);
      }
      if (!validarCurp(curp)) {
        return json({ error: "La CURP ingresada no es válida según el formato oficial." }, 400);
      }

      const { data: ident } = await admin
        .from("qard_identidad")
        .select("phone_verified, email_verified, estado")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ident?.phone_verified) return json({ error: "Primero verifica tu teléfono." }, 400);
      if (!ident?.email_verified) return json({ error: "Primero verifica tu correo." }, 400);

      const { data: curpEnc } = await admin.rpc("qard_enc", { _v: curp });

      const { error: updErr } = await admin
        .from("qard_identidad")
        .update({
          nombre_completo: nombre,
          curp_enc: curpEnc,
          estado: ident.estado === "moral_approved" ? "moral_approved" : "active",
          activated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (updErr) return json({ error: updErr.message }, 400);

      await admin.rpc("qard_ensure_wallet", { _user_id: user.id });

      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: user.id,
        message: "¡Tu tarjeta QaRd quedó ACTIVA! Ya puedes recargar hasta $10,000 QaRd pesos por mes, pagar y transferir.",
      });

      return json({ success: true });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error("[QARD-IDENTIDAD]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
