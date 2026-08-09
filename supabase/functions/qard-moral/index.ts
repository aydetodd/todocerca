// QaRd — Upgrade a Persona Moral: solicitud del usuario y resolución del administrador
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANAL_OFICIAL = "00000000-0000-0000-0000-000000000001";
const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

const DICC = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const ESTADOS = ["AS","BC","BS","CC","CL","CM","CS","CH","DF","DG","GT","GR","HG","JC","MC","MN","MS","NT","NL","OC","PL","QT","QR","SP","SL","SR","TC","TS","TL","VZ","YN","ZS","NE"];
const CURP_REGEX = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

function validarCurp(curp: string): boolean {
  if (!curp || curp.length !== 18 || !CURP_REGEX.test(curp)) return false;
  if (!ESTADOS.includes(curp.slice(11, 13))) return false;
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const v = DICC.indexOf(curp[i]);
    if (v < 0) return false;
    suma += v * (18 - i);
  }
  return ((10 - (suma % 10)) % 10) === Number(curp[17]);
}

const REMITENTE = Deno.env.get("RESEND_FROM") || "TodoCerca <hola@todocerca.mx>";
const LOGO_URL = "https://todocerca.mx/icon-192.png";

async function enviarCorreo(to: string, subject: string, titulo: string, cuerpo: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !to?.includes("@")) return false;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F8F9FA;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
      <tr><td align="center" style="padding-bottom:16px">
        <img src="${LOGO_URL}" width="64" height="64" alt="TodoCerca" style="border-radius:16px;display:block" />
        <div style="font-size:18px;font-weight:700;margin-top:10px">TodoCerca</div>
      </td></tr>
      <tr><td><h1 style="font-size:18px;margin:0 0 12px">${titulo}</h1>${cuerpo}</td></tr>
    </table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMITENTE, to: [to], subject, html, reply_to: "soporte@todocerca.mx" }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
    return res.ok;
  } catch (e) { console.error("Resend fetch error", e); return false; }
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

    // ---------- SOLICITAR ----------
    if (accion === "solicitar") {
      const tipo = String(body.tipo_persona || "moral").toLowerCase() === "fisica" ? "fisica" : "moral";
      const razon = String(body.razon_social || body.nombre_completo || "").trim();
      const rfc = String(body.rfc || "").toUpperCase().replace(/[\s-]/g, "");
      const curp = String(body.curp || "").toUpperCase().trim();
      const path = String(body.constancia_path || "").trim();

      if (razon.length < 3 || razon.length > 200) {
        return json({ error: tipo === "fisica" ? "Escribe tu nombre completo." : "Escribe la razón social de tu empresa." }, 400);
      }
      if (tipo === "moral") {
        if (!RFC_REGEX.test(rfc) || (rfc.length !== 12 && rfc.length !== 13)) {
          return json({ error: "El RFC ingresado no tiene un formato válido." }, 400);
        }
      } else if (!validarCurp(curp)) {
        return json({ error: "La CURP ingresada no es válida según el formato oficial." }, 400);
      }
      if (!path.startsWith(`${user.id}/`)) return json({ error: "Sube la Constancia de Situación Fiscal." }, 400);

      const { data: ident } = await admin
        .from("qard_identidad").select("estado, email_verified").eq("user_id", user.id).maybeSingle();
      if (!ident || ident.estado === "inactive") {
        return json({ error: "Primero activa tu QaRd." }, 400);
      }
      if (!ident.email_verified) {
        return json({ error: "Confirma el código que te enviamos por correo electrónico." }, 400);
      }

      const { data: pend } = await admin
        .from("qard_moral_solicitudes")
        .select("id").eq("user_id", user.id).eq("estado", "pending").maybeSingle();
      if (pend) return json({ error: "Ya tienes una solicitud en revisión." }, 400);

      let curpEnc: string | null = null;
      if (tipo === "fisica") {
        const { data: enc } = await admin.rpc("qard_enc", { _v: curp });
        curpEnc = (enc as string) ?? null;
      }

      const { error: insErr } = await admin.from("qard_moral_solicitudes").insert({
        user_id: user.id,
        tipo_persona: tipo,
        razon_social: razon,
        nombre_completo: tipo === "fisica" ? razon : null,
        curp_enc: curpEnc,
        rfc: tipo === "moral" ? rfc : "",
        constancia_path: path,
      });
      if (insErr) return json({ error: insErr.message }, 400);

      await admin.from("qard_identidad")
        .update({ estado: "moral_review", moral_estado: "pending" })
        .eq("user_id", user.id);

      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: user.id,
        message: "Recibimos tu solicitud de cuenta Comerciante ($200 al año). La revisaremos en 24 a 48 horas.",
      });

      return json({ success: true });
    }

    // ---------- RESOLVER (ADMIN) ----------
    if (accion === "resolver") {
      const { data: esAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!esAdmin) return json({ error: "Solo administradores" }, 403);

      const id = String(body.solicitud_id || "");
      const aprobar = Boolean(body.aprobar);
      const motivo = String(body.motivo || "").trim();

      const { data: sol } = await admin
        .from("qard_moral_solicitudes").select("*").eq("id", id).maybeSingle();
      if (!sol) return json({ error: "Solicitud no encontrada" }, 404);
      if (sol.estado !== "pending") return json({ error: "Esa solicitud ya fue resuelta." }, 400);
      if (!aprobar && motivo.length < 5) return json({ error: "Escribe el motivo del rechazo." }, 400);

      const vence = new Date();
      vence.setFullYear(vence.getFullYear() + 1);

      await admin.from("qard_moral_solicitudes").update({
        estado: aprobar ? "approved" : "rejected",
        suscripcion_vence: aprobar ? vence.toISOString() : null,
        motivo_rechazo: aprobar ? null : motivo,
        revisado_por: user.id,
        revisado_at: new Date().toISOString(),
      }).eq("id", id);

      await admin.from("qard_identidad").update({
        estado: aprobar ? "moral_approved" : "active",
        moral_estado: aprobar ? "approved" : "rejected",
      }).eq("user_id", sol.user_id);

      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: sol.user_id,
        message: aprobar
          ? `¡Tu cuenta de Comerciante fue aprobada! Ya operas sin el tope de $10,000 al mes y puedes retirar a banco u OXXO (comisión 2%).`
          : `Tu solicitud de Comerciante fue rechazada. Motivo: ${motivo}. Tu cuenta sigue activa con el tope de $10,000 al mes.`,
      });

      const { data: perfil } = await admin
        .from("profiles").select("email").eq("user_id", sol.user_id).maybeSingle();
      await enviarCorreo(
        String(perfil?.email || ""),
        aprobar ? "Tu cuenta de Comerciante fue aprobada" : "Tu solicitud de Comerciante fue rechazada",
        aprobar ? "Tu cuenta de Comerciante ha sido aprobada" : "Tu solicitud fue rechazada",
        aprobar
          ? `<p>Ya puedes operar sin límites mensuales y retirar tu dinero a banco (SPEI) o en OXXO. La única comisión es del 2% al retirar.</p>`
          : `<p>Motivo: <b>${motivo}</b></p><p>Tu cuenta sigue activa con el límite de $10,000 al mes. Puedes volver a intentarlo con un documento legible.</p>`,
      );

      return json({ success: true });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error("[QARD-MORAL]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
