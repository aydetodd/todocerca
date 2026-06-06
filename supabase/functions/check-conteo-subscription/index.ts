import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (s: string, d?: any) => console.log(`[CHECK-CONTEO] ${s}${d ? ' - ' + JSON.stringify(d) : ''}`);

const CONTEO_PRICE_ID = 'price_1TfBaXGyH05pxWZzscPZeh7A';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
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

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2025-08-27.basil' });
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ units: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const customerId = customers.data[0].id;

    // Listar suscripciones de Conteo Inteligente activas
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      price: CONTEO_PRICE_ID,
      limit: 100,
      expand: ['data.items'],
    });

    log('Suscripciones encontradas', { count: subs.data.length });

    const activeByUnit = new Map<string, { id: string; end: string }>();
    for (const sub of subs.data) {
      const unitId = sub.metadata?.unit_id;
      if (!unitId) continue;
      activeByUnit.set(unitId, {
        id: sub.id,
        end: new Date(sub.current_period_end * 1000).toISOString(),
      });
    }

    // Traer todas las unidades del proveedor
    const { data: units } = await admin
      .from('unidades_empresa')
      .select('id, nombre, conteo_subscription_id, conteo_subscription_status, conteo_subscription_end')
      .eq('proveedor_id', user.id);

    const result: any[] = [];
    for (const u of units ?? []) {
      const active = activeByUnit.get(u.id);
      const newStatus = active ? 'active' : (u.conteo_subscription_status === 'active' ? 'canceled' : u.conteo_subscription_status);
      const newId = active?.id ?? u.conteo_subscription_id;
      const newEnd = active?.end ?? u.conteo_subscription_end;

      if (newStatus !== u.conteo_subscription_status || newId !== u.conteo_subscription_id || newEnd !== u.conteo_subscription_end) {
        await admin
          .from('unidades_empresa')
          .update({
            conteo_subscription_status: newStatus,
            conteo_subscription_id: newId,
            conteo_subscription_end: newEnd,
          })
          .eq('id', u.id);
      }
      result.push({ unit_id: u.id, nombre: u.nombre, active: !!active, end: active?.end ?? null });
    }

    return new Response(JSON.stringify({ units: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('ERROR', { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
