import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT");

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
    }

    console.log(`[WEBHOOK-CONNECT] Event: ${event.type}`);

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;

      const chargesEnabled = account.charges_enabled ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;
      const detailsSubmitted = account.details_submitted ?? false;

      let estado = "pendiente";
      if (chargesEnabled && payoutsEnabled) {
        estado = "activo";
      } else if (detailsSubmitted) {
        estado = "en_revision";
      }

      // Get pending requirements
      const pendingReqs = account.requirements?.currently_due || [];

      // Update cuentas_conectadas
      const { error } = await supabaseAdmin
        .from("cuentas_conectadas")
        .update({
          estado_stripe: estado,
          pagos_habilitados: chargesEnabled,
          transferencias_habilitadas: payoutsEnabled,
          requisitos_pendientes: pendingReqs.length > 0 ? pendingReqs : null,
        })
        .eq("stripe_account_id", accountId);

      if (error) {
        console.error(`[WEBHOOK-CONNECT] Error updating account ${accountId}:`, error);
      } else {
        console.log(`[WEBHOOK-CONNECT] Account ${accountId} updated: ${estado}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[WEBHOOK-CONNECT] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
