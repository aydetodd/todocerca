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

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      logStep("No active subscriptions found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        message: 'No se encontró suscripción activa en Stripe'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = subscriptions.data[0];
    const subscriptionEnd = new Date(subscription.current_period_end * 1000);
    const subscriptionStart = new Date(subscription.current_period_start * 1000);
    logStep("Active subscription found", { 
      subscriptionId: subscription.id, 
      startDate: subscriptionStart,
      endDate: subscriptionEnd 
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
          amount: 200.00,
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
      subscription_end: subscriptionEnd.toISOString(),
      message: 'Suscripción sincronizada correctamente'
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
