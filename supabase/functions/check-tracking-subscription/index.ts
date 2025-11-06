import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-TRACKING-SUB] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Iniciando verificación de suscripción");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) throw userError;
    const user = userData.user;
    if (!user?.email) throw new Error('Usuario no autenticado');

    logStep("Usuario autenticado", { email: user.email });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Buscar cliente en Stripe
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    if (customers.data.length === 0) {
      logStep("No se encontró cliente en Stripe");
      return new Response(
        JSON.stringify({ subscribed: false, message: 'No customer found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const customerId = customers.data[0].id;
    logStep("Cliente encontrado", { customerId });

    // Buscar suscripciones activas
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    logStep("Estado de suscripción", { hasActiveSub });

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      
      logStep("Suscripción activa encontrada", { 
        subscriptionId: subscription.id,
        endDate: subscriptionEnd 
      });

      // Actualizar el grupo del usuario
      const { data: group, error: groupError } = await supabaseClient
        .from('tracking_groups')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (groupError) {
        logStep("Error buscando grupo", { error: groupError });
        throw groupError;
      }

      if (group) {
        logStep("Actualizando grupo existente", { groupId: group.id });
        
        const { error: updateError } = await supabaseClient
          .from('tracking_groups')
          .update({
            subscription_status: 'active',
            subscription_end: subscriptionEnd,
            updated_at: new Date().toISOString()
          })
          .eq('id', group.id);

        if (updateError) {
          logStep("Error actualizando grupo", { error: updateError });
          throw updateError;
        }

        logStep("Grupo actualizado exitosamente");
      } else {
        logStep("Usuario tiene suscripción activa pero aún no ha creado su grupo");
      }

      return new Response(
        JSON.stringify({
          subscribed: true,
          subscription_end: subscriptionEnd,
          message: 'Subscription active and database updated'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    logStep("No se encontró suscripción activa");
    return new Response(
      JSON.stringify({ subscribed: false, message: 'No active subscription' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
