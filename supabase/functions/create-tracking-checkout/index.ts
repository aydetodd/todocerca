import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-TRACKING-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Iniciando creación de checkout");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user?.email) {
      throw new Error('Usuario no autenticado');
    }

    logStep("Usuario autenticado", { email: user.email });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Buscar o crear cliente en Stripe
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Cliente existente encontrado", { customerId });
    } else {
      logStep("No se encontró cliente, se creará uno nuevo");
    }

    // Crear sesión de checkout con el producto de tracking
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: 'price_1SNeRhGyH05pxWZz6dAjRBZv',
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
      // Permitir códigos promocionales en la UI de Stripe
      allow_promotion_codes: true,
      // Si el total es $0 (por cupón 100%), no pedir método de pago
      payment_method_collection: 'if_required',
    };

    logStep("Configuración de sesión", { 
      hasCustomerId: !!customerId,
      allowPromoCodes: true
    });

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logStep("Sesión de checkout creada", { 
      sessionId: session.id, 
      url: session.url 
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
