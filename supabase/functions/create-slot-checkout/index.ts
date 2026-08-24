import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLOT_PRICE_ID = "price_1U7oz7GyH05pxWZzKuy89YQK"; // $500 MXN por slot (1 año)
const SLOT_COUPON_ID = "EVENTOS100"; // 100% de descuento (simulación)
const MAX_SLOTS = 50;

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
    if (!user?.email) return json({ error: "No autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const lugarId = typeof body.lugar_id === "string" ? body.lugar_id : "";
    const cantidad = Math.floor(Number(body.cantidad));
    if (!lugarId) return json({ error: "Falta el lugar" }, 400);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_SLOTS) {
      return json({ error: `Cantidad inválida (1 a ${MAX_SLOTS})` }, 400);
    }

    // Verificar que el lugar pertenece al usuario
    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: lugar } = await service
      .from("ev_lugares")
      .select("id,nombre,owner_id")
      .eq("id", lugarId)
      .maybeSingle();
    if (!lugar || lugar.owner_id !== user.id) {
      return json({ error: "Este lugar no te pertenece" }, 403);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || "https://todocerca.mx";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: SLOT_PRICE_ID, quantity: cantidad }],
      mode: "payment",
      discounts: [{ coupon: SLOT_COUPON_ID }],
      success_url: `${origin}/eventos?slot_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/eventos`,
      metadata: {
        tipo: "slot_evento",
        lugar_id: lugarId,
        user_id: user.id,
        cantidad: String(cantidad),
      },
    });

    console.log("[SLOT-CHECKOUT] Sesión creada:", session.id, "| lugar:", lugarId, "| slots:", cantidad);
    return json({ url: session.url });
  } catch (error) {
    console.error("[SLOT-CHECKOUT] Error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
