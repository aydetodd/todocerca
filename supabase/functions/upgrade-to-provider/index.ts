import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPGRADE-TO-PROVIDER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Usar service role para bypasear RLS en operaciones administrativas
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body for optional coupon code
    let couponCode: string | undefined;
    try {
      const body = await req.json();
      couponCode = body.couponCode;
      if (couponCode) logStep("Coupon code provided", { couponCode });
    } catch {
      // No body or invalid JSON, continue without coupon
    }

    // Verificar que el usuario sea cliente
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError) throw new Error(`Error getting profile: ${profileError.message}`);
    if (profile.role !== 'cliente') throw new Error("Solo los clientes pueden cambiar a proveedor");
    logStep("User is a client, proceeding with upgrade");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { 
      apiVersion: "2025-08-27.basil" 
    });

    // Buscar o crear cliente de Stripe
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    }

    // Crear sesión de checkout para el pago de upgrade
    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: "price_1SDaOLGyH05pxWZzSeqEjiE1", // $200 MXN anual
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${req.headers.get("origin")}/mi-perfil?upgrade=success`,
      cancel_url: `${req.headers.get("origin")}/mi-perfil?upgrade=cancelled`,
      // 7 días de prueba gratis sin tarjeta
      payment_method_collection: "if_required",
      subscription_data: {
        trial_period_days: 7,
      },
    };

    // Apply coupon if provided, otherwise allow user to enter promo codes in Stripe UI
    if (couponCode) {
      sessionConfig.discounts = [{ coupon: couponCode }];
      logStep("Applying coupon to session", { couponCode });
    } else {
      // Show promo code field in Stripe Checkout UI
      sessionConfig.allow_promotion_codes = true;
      logStep("Allowing promotion codes in checkout");
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
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
