import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_PRICE_MXN = 900; // $9.00 MXN en centavos

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuario no autenticado");

    const { quantity } = await req.json();
    
    if (!quantity || quantity < 1 || quantity > 100) {
      throw new Error("Cantidad inválida. Mínimo 1, máximo 100 boletos.");
    }

    const totalAmount = quantity * TICKET_PRICE_MXN; // en centavos MXN

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create one-time payment session for tickets
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: `QR Boleto Digital × ${quantity}`,
              description: `${quantity} boleto${quantity > 1 ? 's' : ''} de transporte urbano - Hermosillo, Sonora`,
            },
            unit_amount: TICKET_PRICE_MXN,
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/wallet/qr-boletos?purchase=success&qty=${quantity}`,
      cancel_url: `${req.headers.get("origin")}/wallet/qr-boletos?purchase=cancelled`,
      metadata: {
        user_id: user.id,
        ticket_quantity: String(quantity),
        type: "qr_boleto_purchase",
      },
    });

    console.log(`[PURCHASE-TICKETS] Session created for ${quantity} tickets, user: ${user.email}`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[PURCHASE-TICKETS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
