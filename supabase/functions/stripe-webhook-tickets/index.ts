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

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_TICKETS");

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } else {
      // For development without webhook secret
      event = JSON.parse(body);
    }

    console.log(`[WEBHOOK-TICKETS] Event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Only process ticket purchases
      if (session.metadata?.type !== "qr_boleto_purchase") {
        console.log("[WEBHOOK-TICKETS] Not a ticket purchase, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = session.metadata.user_id;
      const quantity = parseInt(session.metadata.ticket_quantity || "0");

      if (!userId || quantity <= 0) {
        throw new Error("Invalid metadata in session");
      }

      console.log(`[WEBHOOK-TICKETS] Adding ${quantity} tickets to user ${userId}`);

      // Get current account
      const { data: account } = await supabaseAdmin
        .from("cuentas_boletos")
        .select("ticket_count, total_comprado")
        .eq("user_id", userId)
        .single();

      if (account) {
        // Update existing account
        await supabaseAdmin
          .from("cuentas_boletos")
          .update({
            ticket_count: account.ticket_count + quantity,
            total_comprado: account.total_comprado + quantity,
          })
          .eq("user_id", userId);
      } else {
        // Create account (shouldn't happen due to trigger, but just in case)
        await supabaseAdmin
          .from("cuentas_boletos")
          .insert({
            user_id: userId,
            ticket_count: quantity,
            total_comprado: quantity,
          });
      }

      // Record transaction
      await supabaseAdmin.from("transacciones_boletos").insert({
        user_id: userId,
        tipo: "compra",
        cantidad_boletos: quantity,
        monto_total: quantity * 9.00,
        stripe_payment_id: session.payment_intent as string,
        estado: "completado",
        descripcion: `Compra de ${quantity} boleto${quantity > 1 ? 's' : ''} QR`,
      });

      console.log(`[WEBHOOK-TICKETS] Successfully added ${quantity} tickets to user ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[WEBHOOK-TICKETS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
