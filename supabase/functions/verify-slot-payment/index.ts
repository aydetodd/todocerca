import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) return json({ error: "No autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId.startsWith("cs_")) return json({ error: "Sesión inválida" }, 400);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.tipo !== "slot_evento") return json({ error: "Sesión no corresponde a slots" }, 400);
    if (session.metadata?.user_id !== user.id) return json({ error: "Esta sesión no te pertenece" }, 403);
    if (session.status !== "complete") return json({ error: "El pago no se completó" }, 400);
    if (!["paid", "no_payment_required"].includes(session.payment_status)) {
      return json({ error: "El pago no fue confirmado" }, 400);
    }

    const lugarId = session.metadata?.lugar_id;
    const cantidad = Math.floor(Number(session.metadata?.cantidad || "0"));
    if (!lugarId || cantidad < 1) return json({ error: "Sesión sin datos de slots" }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Idempotencia: si ya existen slots de esta sesión, no duplicar
    const { data: existing } = await service
      .from("ev_slots")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, yaExistia: true, creados: 0 });
    }

    const now = new Date();
    const vence = new Date(now.getTime());
    vence.setFullYear(vence.getFullYear() + 1);

    const rows = Array.from({ length: cantidad }, (_, i) => ({
      lugar_id: lugarId,
      owner_id: user.id,
      precio_mxn: 500,
      estado: "active",
      pagado_en: now.toISOString(),
      inicia_en: now.toISOString(),
      vence_en: vence.toISOString(),
      stripe_session_id: i === 0 ? sessionId : `${sessionId}:${i}`,
    }));

    const { error } = await service.from("ev_slots").insert(rows);
    if (error) {
      if (error.code === "23505") return json({ ok: true, yaExistia: true, creados: 0 });
      console.error("[VERIFY-SLOT] Insert error:", error);
      return json({ error: "No se pudieron registrar los slots" }, 500);
    }

    console.log("[VERIFY-SLOT] Slots activados:", cantidad, "| lugar:", lugarId);
    return json({ ok: true, creados: cantidad });
  } catch (error) {
    console.error("[VERIFY-SLOT] Error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
