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
      event = JSON.parse(body);
    }

    console.log(`[WEBHOOK-TICKETS] Event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.metadata?.type !== "qr_boleto_purchase") {
        console.log("[WEBHOOK-TICKETS] Not a ticket purchase, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = session.metadata.user_id;
      const quantity = parseInt(session.metadata.ticket_quantity || "0");
      const ticketType = session.metadata.ticket_type || "normal";
      const deviceId = session.metadata.device_id || null;

      if (!userId || quantity <= 0) {
        throw new Error("Invalid metadata in session");
      }

      // Get the actual Stripe fee from the payment intent's charge
      let stripeFee = 0;
      try {
        const paymentIntentId = session.payment_intent as string;
        if (paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ["latest_charge"],
          });
          const charge = paymentIntent.latest_charge as Stripe.Charge;
          if (charge?.balance_transaction) {
            const balanceTx = await stripe.balanceTransactions.retrieve(
              charge.balance_transaction as string
            );
            stripeFee = balanceTx.fee / 100;
            console.log(`[WEBHOOK-TICKETS] Actual Stripe fee: $${stripeFee.toFixed(2)} MXN`);
          }
        }
      } catch (feeErr: any) {
        console.warn(`[WEBHOOK-TICKETS] Could not retrieve Stripe fee: ${feeErr.message}`);
      }

      // If Stripe API didn't return the fee, calculate it mathematically
      // Stripe Mexico: 3.6% + $3.00 MXN fixed per transaction
      if (stripeFee === 0 && quantity > 0) {
        const totalAmount = quantity * ticketAmount;
        stripeFee = (totalAmount * 0.036) + 3.00;
        console.log(`[WEBHOOK-TICKETS] Calculated Stripe fee: $${stripeFee.toFixed(2)} MXN (${quantity} × $${ticketAmount})`);
      }

      const stripeFeePerTicket = quantity > 0 ? stripeFee / quantity : 0;
      const ticketAmount = ticketType === "normal" ? 9.00 : 4.50;

      console.log(`[WEBHOOK-TICKETS] Generating ${quantity} ${ticketType} QR codes for user ${userId}, fee/ticket: $${stripeFeePerTicket.toFixed(4)}`);

      // Generate QR tickets
      const qrInserts = [];
      for (let i = 0; i < quantity; i++) {
        qrInserts.push({
          user_id: userId,
          token: crypto.randomUUID(),
          amount: ticketAmount,
          status: "active",
          is_transferred: false,
          stripe_fee_unitario: stripeFeePerTicket,
          ticket_type: ticketType,
          device_id: ticketType !== "normal" ? deviceId : null,
        });
      }

      const { error: insertError } = await supabaseAdmin
        .from("qr_tickets")
        .insert(qrInserts);

      if (insertError) {
        console.error("[WEBHOOK-TICKETS] Error inserting QR tickets:", insertError);
        throw new Error("Error generating QR tickets");
      }

      // Update cuentas_boletos
      const { data: account } = await supabaseAdmin
        .from("cuentas_boletos")
        .select("total_comprado")
        .eq("user_id", userId)
        .single();

      if (account) {
        await supabaseAdmin
          .from("cuentas_boletos")
          .update({
            total_comprado: account.total_comprado + quantity,
          })
          .eq("user_id", userId);
      } else {
        await supabaseAdmin
          .from("cuentas_boletos")
          .insert({
            user_id: userId,
            total_comprado: quantity,
            ticket_count: 0,
          });
      }

      // Record transaction
      await supabaseAdmin.from("transacciones_boletos").insert({
        user_id: userId,
        tipo: "compra",
        cantidad_boletos: quantity,
        monto_total: quantity * ticketAmount,
        stripe_payment_id: session.payment_intent as string,
        estado: "completado",
        descripcion: `Compra de ${quantity} código${quantity > 1 ? 's' : ''} QR${ticketType !== "normal" ? ` (${ticketType})` : ""}`,
        stripe_fee: stripeFee,
      });

      console.log(`[WEBHOOK-TICKETS] Successfully generated ${quantity} ${ticketType} QR codes for user ${userId}`);
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
