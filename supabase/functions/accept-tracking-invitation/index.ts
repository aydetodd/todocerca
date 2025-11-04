import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptInviteRequest {
  inviteId: string;
  groupId: string;
  nickname: string;
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

    const { inviteId, groupId, nickname }: AcceptInviteRequest = await req.json();

    console.log('Processing invitation acceptance:', { inviteId, groupId, nickname, userId: user.id });

    // Obtener el perfil del usuario
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('telefono')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.telefono) {
      throw new Error('No se encontró el número de teléfono en tu perfil');
    }

    console.log('User profile phone:', profile.telefono);

    // Verificar que la invitación existe y es válida
    const { data: invitation, error: inviteError } = await supabaseClient
      .from('tracking_invitations')
      .select('*')
      .eq('id', inviteId)
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invitation) {
      console.error('Invitation not found or invalid:', inviteError);
      throw new Error('Invitación no válida o expirada');
    }

    // Normalizar teléfonos para comparar (quitar todo excepto números)
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const userPhone = normalizePhone(profile.telefono);
    const invitePhone = normalizePhone(invitation.phone_number);

    console.log('Comparing phones:', { userPhone, invitePhone });

    if (userPhone !== invitePhone) {
      throw new Error('Esta invitación no corresponde a tu número de teléfono');
    }

    // Verificar que el usuario no sea ya miembro del grupo
    const { data: existingMember } = await supabaseClient
      .from('tracking_group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      console.log('User is already a member');
      // Actualizar invitación a aceptada aunque ya sea miembro
      await supabaseClient
        .from('tracking_invitations')
        .update({ status: 'accepted' })
        .eq('id', inviteId);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Ya eres miembro de este grupo',
          alreadyMember: true 
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Insertar el miembro usando service role (bypassa RLS)
    const { data: memberData, error: memberError } = await supabaseClient
      .from('tracking_group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        nickname: nickname,
        phone_number: profile.telefono,
        is_owner: false
      })
      .select()
      .single();

    if (memberError) {
      console.error('Error inserting member:', memberError);
      throw new Error(`No se pudo agregar al grupo: ${memberError.message}`);
    }

    console.log('Member added successfully:', memberData);

    // Actualizar estado de la invitación
    const { error: updateError } = await supabaseClient
      .from('tracking_invitations')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Te has unido al grupo exitosamente',
        member: memberData 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error en accept-tracking-invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
