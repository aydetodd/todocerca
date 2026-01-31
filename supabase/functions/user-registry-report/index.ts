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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
      },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }
    
    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Admin-only access
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });

    if (roleErr) {
      console.error('Error checking admin role:', roleErr);
      throw roleErr;
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Sin permisos de administrador' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

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
