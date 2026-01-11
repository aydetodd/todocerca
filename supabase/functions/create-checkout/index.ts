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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    console.log("[CREATE-CHECKOUT] Function started");

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    console.log("[CREATE-CHECKOUT] User authenticated:", user.email);

    // Get optional coupon code and priceId from request body
    const { couponCode, priceId, planType } = await req.json().catch(() => ({}));
    
    // Validate priceId - use default if not provided
    const validPriceIds = [
      'price_1SDaOLGyH05pxWZzSeqEjiE1', // Plan Básico $200 - 10 productos o taxi/ruta
      'price_1SoDm6GyH05pxWZzEbLT9Ag8', // Plan 100 $300 - 100 productos
      'price_1SoDmZGyH05pxWZzIRwoID4Q', // Plan 500 $400 - 500 productos
    ];
    
    const selectedPriceId = validPriceIds.includes(priceId) ? priceId : validPriceIds[0];
    console.log("[CREATE-CHECKOUT] Selected price ID:", selectedPriceId);
    console.log("[CREATE-CHECKOUT] Plan type:", planType);
    
    if (couponCode) {
      console.log("[CREATE-CHECKOUT] Coupon code provided:", couponCode);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { 
      apiVersion: "2025-08-27.basil" 
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("[CREATE-CHECKOUT] Found existing customer:", customerId);
    } else {
      console.log("[CREATE-CHECKOUT] Creating new customer");
    }

    // Create checkout session for subscription
    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: selectedPriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${req.headers.get("origin")}/dashboard?subscription=success`,
      cancel_url: `${req.headers.get("origin")}/dashboard?subscription=cancelled`,
      // Permitir completar checkout sin tarjeta cuando el total es $0
      payment_method_collection: "if_required",
      metadata: {
        plan_type: planType || 'basico',
        user_id: user.id,
      },
    };

    // Add coupon if provided, otherwise allow user to enter promo codes in Stripe UI
    if (couponCode) {
      sessionConfig.discounts = [{ coupon: couponCode }];
      console.log("[CREATE-CHECKOUT] Applying coupon:", couponCode);
    } else {
      // Show promo code field in Stripe Checkout UI
      sessionConfig.allow_promotion_codes = true;
      console.log("[CREATE-CHECKOUT] Allowing promotion codes in checkout");
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log("[CREATE-CHECKOUT] Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CREATE-CHECKOUT] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
