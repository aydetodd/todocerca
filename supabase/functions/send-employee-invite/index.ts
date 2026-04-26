import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-EMPLOYEE-INVITE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) throw new Error("Usuario no autenticado");

    const { empleado_id, phone_number } = await req.json();
    if (!empleado_id || !phone_number) throw new Error("empleado_id y phone_number son requeridos");

    logStep('Request received', { empleado_id, phone_number });

    // Verify the employee belongs to a company owned by this user
    const { data: emp, error: empError } = await supabaseClient
      .from('empleados_empresa')
      .select('id, nombre, invite_token, empresa_id')
      .eq('id', empleado_id)
      .single();

    if (empError || !emp) throw new Error("Empleado no encontrado");

    const { data: empresa } = await supabaseClient
      .from('empresas_transporte')
      .select('id, nombre, user_id')
      .eq('id', emp.empresa_id)
      .single();

    if (!empresa || empresa.user_id !== user.id) {
      throw new Error("No tienes permiso para invitar empleados de esta empresa");
    }

    logStep('Employee verified', { empName: emp.nombre, empresa: empresa.nombre });

    // Format phone for Twilio SMS
    let formattedPhone = phone_number.replace(/\D/g, '');
    if (!formattedPhone.startsWith('52') && formattedPhone.length === 10) {
      formattedPhone = '52' + formattedPhone;
    }

    const inviteUrl = `https://todocerca.mx/empleado-invitacion?token=${emp.invite_token}`;

    const message = `${empresa.nombre} te invita a registrarte en TodoCerca para recibir tu QR de transporte de personal.\n\n` +
      `Hola ${emp.nombre}, sigue estos pasos:\n` +
      `1. Descarga la app en todocerca.mx\n` +
      `2. Crea tu cuenta con este numero: ${phone_number}\n` +
      `3. Abre este enlace para vincularte:\n${inviteUrl}\n\n` +
      `Una vez vinculado, recibiras tu codigo QR para abordar la unidad de transporte.`;

    // Send SMS via Twilio
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: `+${formattedPhone}`,
      From: twilioPhoneNumber!,
      Body: message,
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      logStep('Twilio error', { errorText });
      
      let errorMessage = 'Error enviando SMS';
      if (errorText.includes('21608')) {
        errorMessage = 'Cuenta Twilio de prueba. Verifica el número en twilio.com o actualiza a cuenta de pago.';
      }
      throw new Error(errorMessage);
    }

    logStep('SMS sent successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Invitación enviada por SMS' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logStep('ERROR', { message: error.message });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
