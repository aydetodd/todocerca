import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPGRADE-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Plan pricing and IDs
const PLANS = {
  basico: {
    priceId: 'price_1SDaOLGyH05pxWZzSeqEjiE1',
    price: 200,
    maxProducts: 10,
    name: 'Plan Básico'
  },
  plan100: {
    priceId: 'price_1SoDm6GyH05pxWZzEbLT9Ag8',
    price: 300,
    maxProducts: 100,
    name: 'Plan 100'
  },
  plan500: {
    priceId: 'price_1SoDmZGyH05pxWZzIRwoID4Q',
    price: 400,
    maxProducts: 500,
    name: 'Plan 500'
  }
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

    // Get the new plan from request body
    const { newPlanType } = await req.json();
    if (!newPlanType || !PLANS[newPlanType as keyof typeof PLANS]) {
      throw new Error("Invalid plan type provided");
    }
    
    const newPlan = PLANS[newPlanType as keyof typeof PLANS];
    logStep("Upgrade requested to plan", { newPlanType, newPlan });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Find the customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No se encontró cliente en Stripe. Primero debes tener una suscripción activa.");
    }
    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No se encontró suscripción activa. Primero debes suscribirte.");
    }

    const subscription = subscriptions.data[0];
    const currentPriceId = subscription.items.data[0]?.price?.id;
    const subscriptionItemId = subscription.items.data[0]?.id;
    
    logStep("Current subscription", { 
      subscriptionId: subscription.id, 
      currentPriceId,
      subscriptionItemId 
    });

    // Check if already on this plan or a higher plan
    if (currentPriceId === newPlan.priceId) {
      throw new Error("Ya tienes este plan activo.");
    }

    // Determine current plan price for validation
    const currentPlanEntry = Object.entries(PLANS).find(([_, p]) => p.priceId === currentPriceId);
    if (currentPlanEntry) {
      const [_, currentPlan] = currentPlanEntry;
      if (currentPlan.price >= newPlan.price) {
        throw new Error("Solo puedes actualizar a un plan superior.");
      }
    }

    // Update the subscription with proration
    // This will charge the prorated difference immediately
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: subscriptionItemId,
          price: newPlan.priceId,
        },
      ],
      proration_behavior: 'always_invoice', // Charge the prorated amount immediately
    });

    logStep("Subscription upgraded", { 
      newSubscriptionId: updatedSubscription.id,
      newPriceId: newPlan.priceId 
    });

    // Calculate approximate upgrade cost
    const proratedAmount = currentPlanEntry 
      ? newPlan.price - currentPlanEntry[1].price 
      : newPlan.price;

    return new Response(JSON.stringify({
      success: true,
      message: `¡Actualización exitosa! Tu plan ahora es ${newPlan.name}.`,
      newPlan: newPlanType,
      maxProducts: newPlan.maxProducts,
      proratedAmount: proratedAmount
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
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
