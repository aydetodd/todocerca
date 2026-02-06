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

const PRIVATE_ROUTE_PRICE_ID = 'price_1Sxfm9GyH05pxWZzsipYs44S';

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

    const { action } = await req.json().catch(() => ({ action: 'add' }));
    logStep("Action requested", { action });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      // No customer yet - create checkout for first vehicle
      logStep("No customer found, creating checkout session");
      
      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        line_items: [{ price: PRIVATE_ROUTE_PRICE_ID, quantity: 1 }],
        mode: "subscription",
        success_url: `${req.headers.get("origin")}/dashboard?private_route=success`,
        cancel_url: `${req.headers.get("origin")}/dashboard?private_route=cancelled`,
        payment_method_collection: "if_required",
        metadata: { plan_type: 'ruta_privada', user_id: user.id },
        allow_promotion_codes: true,
      });

      return new Response(JSON.stringify({ 
        action: 'checkout', 
        url: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Find active private route subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    const privateRouteSub = subscriptions.data.find(sub => 
      sub.items.data.some(item => item.price.id === PRIVATE_ROUTE_PRICE_ID)
    );

    if (!privateRouteSub) {
      // No private route subscription - create checkout
      logStep("No private route subscription found, creating checkout");

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: PRIVATE_ROUTE_PRICE_ID, quantity: 1 }],
        mode: "subscription",
        success_url: `${req.headers.get("origin")}/dashboard?private_route=success`,
        cancel_url: `${req.headers.get("origin")}/dashboard?private_route=cancelled`,
        payment_method_collection: "if_required",
        metadata: { plan_type: 'ruta_privada', user_id: user.id },
        allow_promotion_codes: true,
      });

      return new Response(JSON.stringify({ 
        action: 'checkout', 
        url: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Has active private route subscription
    const subItem = privateRouteSub.items.data.find(item => item.price.id === PRIVATE_ROUTE_PRICE_ID);
    if (!subItem) throw new Error("Subscription item not found");
    
    const currentQuantity = subItem.quantity || 1;
    logStep("Current subscription", { 
      subscriptionId: privateRouteSub.id, 
      currentQuantity,
      itemId: subItem.id 
    });

    if (action === 'add') {
      // Increment quantity
      const newQuantity = currentQuantity + 1;
      
      const updatedSub = await stripe.subscriptions.update(privateRouteSub.id, {
        items: [{
          id: subItem.id,
          quantity: newQuantity,
        }],
        proration_behavior: 'always_invoice',
      });

      logStep("Vehicle added", { newQuantity });

      return new Response(JSON.stringify({
        action: 'added',
        message: `¡Vehículo agregado! Ahora tienes ${newQuantity} unidades suscritas.`,
        quantity: newQuantity,
        subscription_id: updatedSub.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else if (action === 'remove' && currentQuantity > 1) {
      // Decrement quantity (can't go below 1)
      const newQuantity = currentQuantity - 1;
      
      await stripe.subscriptions.update(privateRouteSub.id, {
        items: [{
          id: subItem.id,
          quantity: newQuantity,
        }],
        proration_behavior: 'none',
      });

      logStep("Vehicle removed", { newQuantity });

      return new Response(JSON.stringify({
        action: 'removed',
        message: `Vehículo eliminado. Ahora tienes ${newQuantity} unidades.`,
        quantity: newQuantity,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else if (action === 'status') {
      // Just return current status
      return new Response(JSON.stringify({
        action: 'status',
        subscribed: true,
        quantity: currentQuantity,
        subscription_end: new Date(privateRouteSub.current_period_end * 1000).toISOString(),
        subscription_id: privateRouteSub.id,
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
