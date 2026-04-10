import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[ACCEPT-EMPLOYEE-INVITE] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No autorizado');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error('Usuario no autenticado');

    const userId = userData.user.id;
    const { invite_token } = await req.json();
    if (!invite_token) throw new Error('Token de invitación requerido');

    logStep('Processing', { invite_token, userId });

    // Find employee by invite_token
    const { data: emp, error: empError } = await supabaseClient
      .from('empleados_empresa')
      .select('id, nombre, user_id, is_active, empresa_id')
      .eq('invite_token', invite_token)
      .single();

    if (empError || !emp) {
      logStep('Employee not found', { error: empError });
      throw new Error('Invitación no válida');
    }

    if (!emp.is_active) throw new Error('Esta invitación ya no está activa');

    if (emp.user_id === userId) {
      const { data: empresa } = await supabaseClient
        .from('empresas_transporte')
        .select('nombre')
        .eq('id', emp.empresa_id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          already_linked: true,
          employee_name: emp.nombre,
          company_name: empresa?.nombre || 'Empresa',
          message: 'Ya estás vinculado como empleado',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (emp.user_id && emp.user_id !== userId) {
      throw new Error('Esta invitación ya fue aceptada por otro usuario');
    }

    // Link user_id
    const { error: updateError } = await supabaseClient
      .from('empleados_empresa')
      .update({ user_id: userId })
      .eq('id', emp.id);

    if (updateError) {
      logStep('Update error', { error: updateError });
      throw new Error('Error al vincular tu cuenta');
    }

    const { data: empresa } = await supabaseClient
      .from('empresas_transporte')
      .select('nombre')
      .eq('id', emp.empresa_id)
      .single();

    logStep('Employee linked', { empId: emp.id, userId });

    return new Response(
      JSON.stringify({
        success: true,
        already_linked: false,
        employee_name: emp.nombre,
        company_name: empresa?.nombre || 'Empresa',
        message: `Te has vinculado como empleado de ${empresa?.nombre || 'la empresa'}`,
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
