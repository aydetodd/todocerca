import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all profiles
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('consecutive_number, role, nombre, apodo, telefono, email, codigo_postal, created_at')
      .order('consecutive_number', { ascending: true });

    if (error) {
      console.error('Error fetching profiles:', error);
      throw error;
    }

    const formattedUsers = profiles?.map(user => ({
      ...user,
      codigo: user.role === 'cliente' ? `C${user.consecutive_number}` : `P${user.consecutive_number}`
    })) || [];

    const clientes = formattedUsers.filter(u => u.role === 'cliente').length;
    const proveedores = formattedUsers.filter(u => u.role === 'proveedor').length;

    return new Response(
      JSON.stringify({
        users: formattedUsers,
        stats: {
          total: formattedUsers.length,
          clientes,
          proveedores
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
