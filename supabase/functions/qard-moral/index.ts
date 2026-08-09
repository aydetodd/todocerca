// QaRd — Upgrade a Persona Moral: solicitud del usuario y resolución del administrador
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANAL_OFICIAL = "00000000-0000-0000-0000-000000000001";
const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

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
      const razon = String(body.razon_social || "").trim();
      const rfc = String(body.rfc || "").toUpperCase().replace(/[\s-]/g, "");
      const path = String(body.constancia_path || "").trim();

      if (razon.length < 3 || razon.length > 200) return json({ error: "Escribe la razón social de tu empresa." }, 400);
      if (!RFC_REGEX.test(rfc) || (rfc.length !== 12 && rfc.length !== 13)) {
        return json({ error: "El RFC ingresado no tiene un formato válido." }, 400);
      }
      if (!path.startsWith(`${user.id}/`)) return json({ error: "Sube la Constancia de Situación Fiscal." }, 400);

      const { data: ident } = await admin
        .from("qard_identidad").select("estado").eq("user_id", user.id).maybeSingle();
      if (!ident || ident.estado === "inactive") {
        return json({ error: "Primero activa tu QaRd como persona física." }, 400);
      }

      const { data: pend } = await admin
        .from("qard_moral_solicitudes")
        .select("id").eq("user_id", user.id).eq("estado", "pending").maybeSingle();
      if (pend) return json({ error: "Ya tienes una solicitud en revisión." }, 400);

      const { error: insErr } = await admin.from("qard_moral_solicitudes").insert({
        user_id: user.id, razon_social: razon, rfc, constancia_path: path,
      });
      if (insErr) return json({ error: insErr.message }, 400);

      await admin.from("qard_identidad")
        .update({ estado: "moral_review", moral_estado: "pending" })
        .eq("user_id", user.id);

      await admin.from("messages").insert({
        sender_id: CANAL_OFICIAL,
        receiver_id: user.id,
        message: "Recibimos tu solicitud de Persona Moral. La revisaremos en 24 a 48 horas.",
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

      await admin.from("qard_moral_solicitudes").update({
        estado: aprobar ? "approved" : "rejected",
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
          ? `¡Tu cuenta ${sol.razon_social} fue aprobada como Persona Moral! Ya no tienes el tope de $10,000 al mes para recargar.`
          : `Tu solicitud de Persona Moral fue rechazada. Motivo: ${motivo}. Tu cuenta sigue activa como persona física.`,
      });

      return json({ success: true });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error("[QARD-MORAL]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
