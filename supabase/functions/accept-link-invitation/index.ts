import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ACCEPT-LINK-INVITATION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const userId = userData.user.id;
    logStep('User authenticated', { userId });

    const { invite_token, nickname } = await req.json();
    
    if (!invite_token) {
      throw new Error('Token de invitación requerido');
    }

    logStep('Processing invitation', { invite_token });

    // Find the invitation by token
    const { data: invitation, error: inviteError } = await supabaseClient
      .from('tracking_invitations')
      .select('*, tracking_groups(name, owner_id)')
      .eq('invite_token', invite_token)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      logStep('Invitation not found', { error: inviteError });
      throw new Error('Invitación no válida o expirada');
    }

    logStep('Invitation found', { groupId: invitation.group_id, groupName: invitation.tracking_groups?.name });

    // Check if invitation is expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      throw new Error('La invitación ha expirado');
    }

    // Check if user is already a member
    const { data: existingMember } = await supabaseClient
      .from('tracking_group_members')
      .select('id')
      .eq('group_id', invitation.group_id)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      throw new Error('Ya eres miembro de este grupo');
    }

    // Get user's phone if available
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('telefono, apodo')
      .eq('user_id', userId)
      .single();

    // Use provided nickname, or invitation nickname, or profile nickname
    const memberNickname = nickname || invitation.nickname || profile?.apodo || 'Miembro';

    // Add user as member
    const { error: memberError } = await supabaseClient
      .from('tracking_group_members')
      .insert({
        group_id: invitation.group_id,
        user_id: userId,
        nickname: memberNickname,
        phone_number: profile?.telefono,
        is_owner: false,
      });

    if (memberError) {
      logStep('Error adding member', { error: memberError });
      throw new Error('Error al unirse al grupo');
    }

    // Update invitation status
    await supabaseClient
      .from('tracking_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    logStep('Successfully joined group', { groupId: invitation.group_id });

    return new Response(
      JSON.stringify({
        success: true,
        group_id: invitation.group_id,
        group_name: invitation.tracking_groups?.name,
        message: `Te has unido al grupo "${invitation.tracking_groups?.name}"`
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
