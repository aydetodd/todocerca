import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-DEVICES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user?.email) {
      throw new Error('Usuario no autenticado');
    }

    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Buscar cliente en Stripe
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(
        JSON.stringify({ 
          additional_devices: 0,
          message: 'No hay cliente en Stripe'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Buscar suscripciones activas de dispositivos adicionales
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 100,
    });

    logStep("Found subscriptions", { count: subscriptions.data.length });

    // Contar dispositivos adicionales (price_1SQWOSGyH05pxWZz6WKwcTj8)
    let totalAdditionalDevices = 0;
    const additionalDevicesPriceId = 'price_1SQWOSGyH05pxWZz6WKwcTj8';

    for (const subscription of subscriptions.data) {
      for (const item of subscription.items.data) {
        if (item.price.id === additionalDevicesPriceId) {
          totalAdditionalDevices += item.quantity;
          logStep("Found additional devices", { 
            subscriptionId: subscription.id, 
            quantity: item.quantity 
          });
        }
      }
    }

    logStep("Total additional devices purchased", { totalAdditionalDevices });

    // Actualizar max_devices en tracking_groups para todos los grupos del usuario
    const totalMaxDevices = 5 + totalAdditionalDevices;

    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!profileData) {
      throw new Error('Profile not found');
    }

    const { data: groups, error: updateError } = await supabaseClient
      .from('tracking_groups')
      .update({ max_devices: totalMaxDevices })
      .eq('owner_id', profileData.id)
      .select();

    if (updateError) {
      logStep("Error updating groups", { error: updateError });
      throw updateError;
    }

    logStep("Updated groups", { 
      groupsUpdated: groups?.length || 0,
      newMaxDevices: totalMaxDevices
    });

    return new Response(
      JSON.stringify({ 
        additional_devices: totalAdditionalDevices,
        max_devices: totalMaxDevices,
        groups_updated: groups?.length || 0,
        message: 'Sincronización exitosa'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    logStep("ERROR", { error: error.message });
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});