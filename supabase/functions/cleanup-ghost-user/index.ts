import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { phone } = await req.json()
    
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Teléfono requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Verificar que quien llama es admin (user_id específico o rol)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no válido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar si es admin
    const { data: callerProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden ejecutar esta función' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalizar teléfono para buscar en email
    const normalizedPhone = phone.replace(/\+/g, '').replace(/\s/g, '')
    const emailPattern = `%${normalizedPhone}%`

    console.log(`Looking for ghost user with phone: ${normalizedPhone}`)

    // Buscar usuarios en auth.users con ese email pattern
    const { data: authUsers, error: listError } = await supabaseClient.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      throw listError
    }

    // Filtrar usuarios que coincidan con el patrón
    const matchingUsers = authUsers.users.filter(u => 
      u.email?.includes(normalizedPhone)
    )

    if (matchingUsers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No se encontró usuario con ese teléfono', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let deletedCount = 0
    const deletedUsers: string[] = []

    for (const authUser of matchingUsers) {
      // Verificar si tiene perfil en profiles
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle()

      // Si es usuario fantasma (sin perfil), eliminarlo
      if (!profile) {
        console.log(`Deleting ghost user: ${authUser.id} (${authUser.email})`)
        
        // Limpiar cualquier dato residual
        await supabaseClient.from('clientes').delete().eq('user_id', authUser.id)
        await supabaseClient.from('proveedores').delete().eq('user_id', authUser.id)
        await supabaseClient.from('favoritos').delete().eq('user_id', authUser.id)
        await supabaseClient.from('tracking_member_locations').delete().eq('user_id', authUser.id)
        await supabaseClient.from('tracking_group_members').delete().eq('user_id', authUser.id)
        await supabaseClient.from('proveedor_locations').delete().eq('user_id', authUser.id)
        await supabaseClient.from('messages').delete().eq('sender_id', authUser.id)
        await supabaseClient.from('user_contacts').delete().eq('user_id', authUser.id)
        await supabaseClient.from('user_contacts').delete().eq('contact_user_id', authUser.id)

        // Eliminar usuario de auth
        const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(authUser.id)
        
        if (deleteError) {
          console.error(`Error deleting user ${authUser.id}:`, deleteError)
        } else {
          deletedCount++
          deletedUsers.push(authUser.email || authUser.id)
        }
      } else {
        console.log(`User ${authUser.email} has a profile, not a ghost user`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Se eliminaron ${deletedCount} usuario(s) fantasma`,
        deleted: deletedCount,
        deletedUsers
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Error inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
