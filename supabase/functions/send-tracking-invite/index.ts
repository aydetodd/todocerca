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

    const { phoneNumber, nickname, groupId, groupName }: InviteRequest = await req.json();

    // Formatear número de teléfono para WhatsApp (quitar el + si viene)
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    // Si el número ya viene con código de país, usarlo tal cual
    // Si no viene con código, asumir México y agregar 521
    if (!formattedPhone.startsWith('52') && formattedPhone.length === 10) {
      formattedPhone = '521' + formattedPhone;
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

    // Enviar WhatsApp
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const message = `🗺️ *Invitación a Grupo de Tracking GPS*\n\n` +
      `Has sido invitado por ${user.email || 'un familiar'} a unirte al grupo "${groupName}".\n\n` +
      `Para aceptar la invitación:\n` +
      `1. Regístrate en la app con este número: ${phoneNumber}\n` +
      `2. Automáticamente te unirás al grupo\n` +
      `3. Podrás compartir tu ubicación con el grupo\n\n` +
      `La invitación expira en 7 días.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const body = new URLSearchParams({
      To: `whatsapp:+${formattedPhone}`,
      From: `whatsapp:${twilioPhoneNumber}`,
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
      throw new Error(`Error enviando WhatsApp: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitación enviada exitosamente',
        invitation 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en send-tracking-invite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});