import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get profile_id
    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profileData) {
      throw new Error('Profile not found');
    }
    logStep("Profile found", { profileId: profileData.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning unsubscribed state");
      return new Response(JSON.stringify({ 
        subscribed: false,
        message: 'No se encontró cliente en Stripe'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for active AND trialing subscriptions (free trial support)
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const trialingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 1,
    });

    const allSubs = [...activeSubscriptions.data, ...trialingSubscriptions.data];
    
    if (allSubs.length === 0) {
      logStep("No active or trialing subscriptions found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        message: 'No se encontró suscripción activa en Stripe'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = allSubs[0];
    const isTrial = subscription.status === 'trialing';
    logStep("Subscription found", { status: subscription.status, isTrial });
    
    // Get product and price info
    const priceId = subscription.items.data[0]?.price?.id;
    const productId = subscription.items.data[0]?.price?.product as string;
    const amount = (subscription.items.data[0]?.price?.unit_amount || 20000) / 100; // Convert from cents
    
    // Determine plan type based on price ID
    const planMapping: { [key: string]: { type: string; maxProducts: number } } = {
      'price_1SDaOLGyH05pxWZzSeqEjiE1': { type: 'basico', maxProducts: 10 },
      'price_1SoDm6GyH05pxWZzEbLT9Ag8': { type: 'plan100', maxProducts: 100 },
      'price_1SoDmZGyH05pxWZzIRwoID4Q': { type: 'plan500', maxProducts: 500 },
    };
    
    const planInfo = planMapping[priceId] || { type: 'basico', maxProducts: 10 };
    logStep("Determined plan info", { priceId, productId, planType: planInfo.type, maxProducts: planInfo.maxProducts });
    
    // Handle subscription dates - use defaults for manual/lifetime subscriptions
    let subscriptionEnd: Date;
    let subscriptionStart: Date;
    
    if (subscription.current_period_end && subscription.current_period_start) {
      // Normal recurring subscription with valid dates
      subscriptionEnd = new Date(subscription.current_period_end * 1000);
      subscriptionStart = new Date(subscription.current_period_start * 1000);
      
      // Validate the Date objects are valid
      if (isNaN(subscriptionEnd.getTime()) || isNaN(subscriptionStart.getTime())) {
        logStep("Invalid Date objects created", { 
          end: subscription.current_period_end,
          start: subscription.current_period_start
        });
        throw new Error('Fechas de suscripción inválidas');
      }
    } else {
      // Manual/lifetime subscription - use long-term dates
      logStep("Manual subscription without period dates, using defaults", { 
        subscriptionId: subscription.id
      });
      subscriptionStart = new Date();
      subscriptionEnd = new Date();
      subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1); // 1 year from now
    }
    
    logStep("Active subscription found", { 
      subscriptionId: subscription.id, 
      startDate: subscriptionStart.toISOString(),
      endDate: subscriptionEnd.toISOString(),
      planType: planInfo.type,
      amount
    });

    // Sync subscription to database
    const { data: existingSub } = await supabaseClient
      .from('subscriptions')
      .select('id')
      .eq('profile_id', profileData.id)
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabaseClient
        .from('subscriptions')
        .update({
          status: 'activa',
          end_date: subscriptionEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSub.id);

      if (updateError) {
        logStep("Error updating subscription", { error: updateError });
        throw updateError;
      }
      logStep("Subscription updated in database");
    } else {
      // Insert new subscription
      const { error: insertError } = await supabaseClient
        .from('subscriptions')
        .insert({
          profile_id: profileData.id,
          stripe_subscription_id: subscription.id,
          status: 'activa',
          start_date: subscriptionStart.toISOString(),
          end_date: subscriptionEnd.toISOString(),
          amount: amount,
          currency: 'MXN',
          payment_method: 'stripe'
        });

      if (insertError) {
        logStep("Error inserting subscription", { error: insertError });
        throw insertError;
      }
      logStep("Subscription inserted in database");
    }

    return new Response(JSON.stringify({
      subscribed: true,
      is_trial: isTrial,
      subscription_end: subscriptionEnd.toISOString(),
      plan_type: planInfo.type,
      max_products: planInfo.maxProducts,
      product_id: productId,
      price_id: priceId,
      amount: amount,
      message: isTrial 
        ? 'Periodo de prueba activo (7 días gratis)' 
        : 'Suscripción sincronizada correctamente'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
