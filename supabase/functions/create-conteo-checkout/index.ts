import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CONTEO-CHECKOUT] ${step}${detailsStr}`);
};

// Conteo Inteligente: $500 MXN/año por unidad con sensor de pasajeros
const CONTEO_PRICE_ID = 'price_1TfBaXGyH05pxWZzscPZeh7A';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Inicio");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user?.email) throw new Error('Usuario no autenticado');

    const body = await req.json().catch(() => ({}));
    const unit_id: string | undefined = body?.unit_id;
    const returnTo: string | undefined = body?.returnTo;
    if (!unit_id || typeof unit_id !== 'string') {
      throw new Error('unit_id requerido');
    }

    // Verificar que la unidad pertenece al usuario
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: prov, error: provErr } = await admin
      .from('proveedores')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (provErr) throw provErr;
    if (!prov) throw new Error('Perfil de proveedor no encontrado');

    const { data: unit, error: unitErr } = await admin
      .from('unidades_empresa')
      .select('id, nombre, proveedor_id, conteo_subscription_status')
      .eq('id', unit_id)
      .maybeSingle();
    if (unitErr) throw unitErr;
    if (!unit) throw new Error('Unidad no encontrada');
    if (unit.proveedor_id !== prov.id) throw new Error('No autorizado');

    if (unit.conteo_subscription_status === 'active') {
      throw new Error('Esta unidad ya tiene Conteo Inteligente activo');
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: CONTEO_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${req.headers.get('origin')}${returnTo || '/panel-concesionario'}${(returnTo || '').includes('?') ? '&' : '?'}conteo_success=true&unit_id=${unit_id}`,
      cancel_url: `${req.headers.get('origin')}${returnTo || '/panel-concesionario'}${(returnTo || '').includes('?') ? '&' : '?'}conteo_cancelled=true`,
      metadata: {
        user_id: user.id,
        product_type: 'conteo_inteligente',
        unit_id,
        unit_nombre: unit.nombre,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          product_type: 'conteo_inteligente',
          unit_id,
        },
      },
      allow_promotion_codes: true,
    });

    logStep("Sesión creada", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
