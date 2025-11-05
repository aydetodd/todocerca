import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
  phoneNumber: string;
  nickname: string;
  groupId: string;
  groupName: string;
}

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
    
    if (!user) {
      throw new Error("Usuario no autenticado");
    }

    // Obtener el nombre del perfil del usuario
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('nombre, apodo')
      .eq('user_id', user.id)
      .single();

    const senderName = profile?.nombre || profile?.apodo || 'Un familiar';

    const { phoneNumber, nickname, groupId, groupName }: InviteRequest = await req.json();

    // Formatear número de teléfono para WhatsApp (quitar el + si viene)
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    // Si el número ya viene con código de país, usarlo tal cual
    // Si no viene con código, asumir México y agregar 521
    if (!formattedPhone.startsWith('52') && formattedPhone.length === 10) {
      formattedPhone = '521' + formattedPhone;
    }

    // Verificar si ya existe una invitación pendiente (normalizar teléfonos)
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const normalizedPhone = normalizePhone(phoneNumber);
    
    const { data: existingInvites } = await supabaseClient
      .from('tracking_invitations')
      .select('*')
      .eq('group_id', groupId);

    // Buscar invitación pendiente con el mismo teléfono normalizado
    const existingInvite = existingInvites?.find(
      inv => normalizePhone(inv.phone_number) === normalizedPhone && inv.status === 'pending'
    );

    if (existingInvite) {
      // Si la invitación ya expiró, eliminarla y continuar
      if (new Date(existingInvite.expires_at) < new Date()) {
        await supabaseClient
          .from('tracking_invitations')
          .delete()
          .eq('id', existingInvite.id);
      } else {
        throw new Error('Ya existe una invitación pendiente para este número. Cancela la anterior primero.');
      }
    }

    // Crear invitación en la base de datos
    const { data: invitation, error: inviteError } = await supabaseClient
      .from('tracking_invitations')
      .insert({
        group_id: groupId,
        phone_number: phoneNumber,
        nickname: nickname,
        invited_by: user.id,
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // Enviar SMS
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const message = `Invitacion a Grupo de Tracking GPS\n\n` +
      `${senderName} te invita al grupo "${groupName}".\n\n` +
      `Para unirte:\n` +
      `1. Inicia sesion en todocerca.mx con este numero: ${phoneNumber}\n` +
      `2. Ve a "Tracking GPS" para aceptar la invitacion\n\n` +
      `Expira en 7 dias.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const body = new URLSearchParams({
      To: `+${formattedPhone}`,
      From: twilioPhoneNumber,
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
      console.error('Twilio error:', errorText);
      
      // Eliminar la invitación si falla el envío
      await supabaseClient
        .from('tracking_invitations')
        .delete()
        .eq('id', invitation.id);
      
      if (errorText.includes('21608')) {
        throw new Error('Tu cuenta de Twilio es de prueba. Para enviar SMS debes:\n1. Verificar este número en twilio.com/console/phone-numbers/verified\n2. O actualizar a cuenta de pago en twilio.com/console/billing');
      }
      throw new Error(`Error enviando SMS: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitación enviada exitosamente',
        invitation 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error en send-tracking-invite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});