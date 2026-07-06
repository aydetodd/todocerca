// QaRd — Recarga de saldo vía Stripe Checkout (mín $200 MXN, sin comisiones al usuario)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_RECARGA = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseAnon.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const body = await req.json();
    const monto = Number(body.monto_mxn);
    if (!monto || monto < MIN_RECARGA) {
      throw new Error(`Recarga mínima $${MIN_RECARGA} MXN`);
    }

    // Asegurar wallet + qard_number
    await admin.rpc("qard_ensure_wallet", { _user_id: user.id });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email!,
      line_items: [{
        price_data: {
          currency: "mxn",
          product_data: {
            name: `Recarga QaRd`,
            description: `Saldo recargable universal. Sin comisiones al usuario.`,
          },
          unit_amount: Math.round(monto * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: `${req.headers.get("origin")}/qard?recarga=success&monto=${monto}`,
      cancel_url: `${req.headers.get("origin")}/qard?recarga=cancelled`,
      metadata: {
        type: "qard_recarga",
        user_id: user.id,
        monto_mxn: String(monto),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[QARD-RECARGAR]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
