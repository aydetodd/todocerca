import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user?.email) {
      throw new Error('Usuario no autenticado');
    }

    // Get optional coupon code from request body
    const { couponCode } = await req.json().catch(() => ({}));
    if (couponCode) {
      console.log('[CREATE-TRACKING-CHECKOUT] Coupon code provided:', couponCode);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Buscar o crear cliente en Stripe
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Crear sesión de checkout con el producto de tracking
    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: 'price_1SNeRhGyH05pxWZz6dAjRBZv', // ID del precio creado
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.get('origin')}/tracking-gps?success=true`,
      cancel_url: `${req.headers.get('origin')}/tracking-gps?cancelled=true`,
      metadata: {
        user_id: user.id,
        product_type: 'tracking_gps'
      },
      // Permitir completar checkout sin tarjeta cuando el total es $0
      payment_method_collection: 'if_required',
    };

    // Add coupon if provided
    if (couponCode) {
      sessionConfig.discounts = [{ coupon: couponCode }];
      console.log('[CREATE-TRACKING-CHECKOUT] Applying coupon:', couponCode);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
