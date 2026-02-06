import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ACCEPT-DRIVER-INVITE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No autorizado');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !userData.user) {
      throw new Error('Usuario no autenticado');
    }

    const userId = userData.user.id;
    logStep('User authenticated', { userId });

    const { invite_token } = await req.json();

    if (!invite_token) {
      throw new Error('Token de invitación requerido');
    }

    logStep('Processing driver invite', { invite_token });

    // Find the driver record by invite_token
    const { data: driver, error: driverError } = await supabaseClient
      .from('choferes_empresa')
      .select('id, nombre, proveedor_id, user_id, is_active, telefono')
      .eq('invite_token', invite_token)
      .single();

    if (driverError || !driver) {
      logStep('Driver record not found', { error: driverError });
      throw new Error('Invitación no válida o expirada');
    }

    if (!driver.is_active) {
      throw new Error('Esta invitación ya no está activa');
    }

    // Check if already linked to this user
    if (driver.user_id === userId) {
      logStep('Already linked to this user');

      const { data: proveedor } = await supabaseClient
        .from('proveedores')
        .select('nombre')
        .eq('id', driver.proveedor_id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          already_linked: true,
          driver_name: driver.nombre,
          business_name: proveedor?.nombre || 'Empresa',
          message: 'Ya estás registrado como chofer',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already linked to another user
    if (driver.user_id && driver.user_id !== userId) {
      throw new Error('Esta invitación ya fue aceptada por otro usuario');
    }

    // Link user_id to the driver record
    const { error: updateError } = await supabaseClient
      .from('choferes_empresa')
      .update({ user_id: userId })
      .eq('id', driver.id);

    if (updateError) {
      logStep('Error updating driver', { error: updateError });
      throw new Error('Error al vincular tu cuenta');
    }

    // Get business name
    const { data: proveedor } = await supabaseClient
      .from('proveedores')
      .select('nombre')
      .eq('id', driver.proveedor_id)
      .single();

    logStep('Driver linked successfully', { driverId: driver.id, userId });

    return new Response(
      JSON.stringify({
        success: true,
        already_linked: false,
        driver_name: driver.nombre,
        business_name: proveedor?.nombre || 'Empresa',
        message: `Te has registrado como chofer de ${proveedor?.nombre || 'la empresa'}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    logStep('ERROR', { message });
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
