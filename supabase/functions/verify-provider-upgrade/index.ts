import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-PROVIDER-UPGRADE] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Obtener perfil actual
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError) throw new Error(`Error getting profile: ${profileError.message}`);
    logStep("Profile found", { role: profile.role });

    // Si ya es proveedor, retornar success
    if (profile.role === 'proveedor') {
      logStep("User is already a provider");
      return new Response(JSON.stringify({ 
        upgraded: true, 
        message: "Ya eres proveedor" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Verificar pago en Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { 
      apiVersion: "2025-08-27.basil" 
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ 
        upgraded: false, 
        message: "No se encontró pago completado" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Buscar pagos completados con el metadata de upgrade
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 10,
    });

    const upgradeCharge = charges.data.find(charge => 
      charge.paid && 
      charge.status === 'succeeded' &&
      charge.metadata?.upgrade_type === 'cliente_to_proveedor'
    );

    if (!upgradeCharge) {
      logStep("No successful upgrade payment found");
      return new Response(JSON.stringify({ 
        upgraded: false, 
        message: "No se encontró pago completado" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Upgrade payment found", { chargeId: upgradeCharge.id });

    // Actualizar rol a proveedor
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ role: 'proveedor' })
      .eq('user_id', user.id);

    if (updateError) throw new Error(`Error updating role: ${updateError.message}`);
    logStep("Role updated to proveedor");

    // Asegurar que exista registro en tabla proveedores
    const { data: proveedorData, error: proveedorError } = await supabaseClient
      .from('proveedores')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!proveedorData) {
      logStep("Creating proveedor record");
      const { error: insertError } = await supabaseClient
        .from('proveedores')
        .insert({
          user_id: user.id,
          nombre: profile.nombre || user.email?.split('@')[0] || 'Proveedor',
          email: user.email,
        });

      if (insertError) {
        logStep("Error creating proveedor record", { error: insertError.message });
      } else {
        logStep("Proveedor record created");
      }
    }

    return new Response(JSON.stringify({ 
      upgraded: true, 
      message: "¡Ahora eres proveedor!" 
    }), {
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
