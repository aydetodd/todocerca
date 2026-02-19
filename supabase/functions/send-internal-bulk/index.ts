import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden enviar mensajes masivos' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, excludeUsersWithWelcome } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'El mensaje es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all user IDs (exclude system user)
    const { data: allProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, apodo, nombre')
      .neq('user_id', SYSTEM_USER_ID);

    if (profilesError || !allProfiles?.length) {
      return new Response(
        JSON.stringify({ error: 'No se encontraron usuarios', details: profilesError?.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let targetUsers = allProfiles;

    // Optionally exclude users who already received a welcome message from the system
    if (excludeUsersWithWelcome) {
      const { data: existingMessages } = await supabase
        .from('messages')
        .select('receiver_id')
        .eq('sender_id', SYSTEM_USER_ID);

      const alreadySentIds = new Set(existingMessages?.map(m => m.receiver_id) || []);
      targetUsers = targetUsers.filter(u => !alreadySentIds.has(u.user_id));
    }

    console.log(`[send-internal-bulk] Sending to ${targetUsers.length} users`);

    let sent = 0;
    let errors = 0;

    // Send messages in batches
    const batchSize = 50;
    for (let i = 0; i < targetUsers.length; i += batchSize) {
      const batch = targetUsers.slice(i, i + batchSize);
      
      const messagesToInsert = batch.map(u => {
        // Personalize message with user's name
        const displayName = u.apodo || u.nombre || 'Usuario';
        const personalizedMessage = message.replace(/{nombre}/g, displayName);
        
        return {
          sender_id: SYSTEM_USER_ID,
          receiver_id: u.user_id,
          message: personalizedMessage,
          is_panic: false,
          is_read: false,
        };
      });

      const { error: insertError } = await supabase
        .from('messages')
        .insert(messagesToInsert);

      if (insertError) {
        console.error(`[send-internal-bulk] Batch error:`, insertError.message);
        errors += batch.length;
      } else {
        sent += batch.length;
      }
    }

    console.log(`[send-internal-bulk] Done: ${sent} sent, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent, 
        errors, 
        total: targetUsers.length,
        message: `Mensaje enviado a ${sent} usuarios` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[send-internal-bulk] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
