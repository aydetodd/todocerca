import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADD-PRIVATE-VEHICLE] ${step}${detailsStr}`);
};

const ROUTE_PRICE_IDS: Record<string, string> = {
  privada: 'price_1Sxfm9GyH05pxWZzsipYs44S',   // $400 MXN/año
  urbana: 'price_1T2CnkGyH05pxWZzVkdCLsOv',     // $200 MXN/año
  foranea: 'price_1T2CoFGyH05pxWZzNBI6rGfp',     // $200 MXN/año
  taxi: 'price_1T2DjpGyH05pxWZzIh42h31H',        // $200 MXN/año
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const { action, transportType } = await req.json().catch(() => ({ action: 'add', transportType: 'privada' }));
    const routeType = transportType || 'privada';
    const priceId = ROUTE_PRICE_IDS[routeType] || ROUTE_PRICE_IDS.privada;
    logStep("Action requested", { action, routeType, priceId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (action === 'add') {
      // ALWAYS create a checkout session for each new unit
      // This ensures every addition goes through the payment gateway
      logStep("Creating checkout session for new unit");

      const sessionConfig: any = {
        customer_email: user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${req.headers.get("origin")}/dashboard?private_route=success`,
        cancel_url: `${req.headers.get("origin")}/dashboard?private_route=cancelled`,
        // 7 días de prueba gratis sin tarjeta
        payment_method_collection: "if_required",
        subscription_data: {
          trial_period_days: 7,
        },
        metadata: { plan_type: `ruta_${routeType}`, user_id: user.id },
        allow_promotion_codes: true,
      };

      // If customer exists, use their ID instead of email
      if (customers.data.length > 0) {
        sessionConfig.customer = customers.data[0].id;
        delete sessionConfig.customer_email;
        logStep("Using existing customer", { customerId: customers.data[0].id });
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);
      logStep("Checkout session created", { sessionId: session.id });

      return new Response(JSON.stringify({ 
        action: 'checkout', 
        url: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === 'status') {
      // Return current subscription status - count all active private route subscriptions
      if (customers.data.length === 0) {
        return new Response(JSON.stringify({
          action: 'status',
          subscribed: false,
          quantity: 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const customerId = customers.data[0].id;
      logStep("Checking status for customer", { customerId });

      // Check both active and trialing (free trial) subscriptions
      const activeSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 100,
      });
      const trialingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 100,
      });
      const subscriptions = { data: [...activeSubs.data, ...trialingSubs.data] };

      // Count total quantity across all route subscriptions for this type
      let totalQuantity = 0;
      let earliestEnd: number | null = null;
      const allRoutePriceIds = Object.values(ROUTE_PRICE_IDS);

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          if (item.price.id === priceId) {
            totalQuantity += item.quantity || 1;
            const endTime = sub.current_period_end;
            if (!earliestEnd || endTime < earliestEnd) {
              earliestEnd = endTime;
            }
          }
        }
      }

      logStep("Subscription status", { totalQuantity, earliestEnd });

      return new Response(JSON.stringify({
        action: 'status',
        subscribed: totalQuantity > 0,
        quantity: totalQuantity,
        subscription_end: earliestEnd ? new Date(earliestEnd * 1000).toISOString() : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
