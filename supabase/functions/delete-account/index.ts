import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header provided')
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
    
    // Verify the user's token and get user info
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      console.error('Error getting user:', userError)
      return new Response(
        JSON.stringify({ error: 'Usuario no válido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = user.id
    console.log(`Starting account deletion for user: ${userId}`)

    // Get user's profile to find related data
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    // Get user's proveedor if exists
    const { data: proveedor } = await supabaseClient
      .from('proveedores')
      .select('id')
      .eq('user_id', userId)
      .single()

    // Delete in order to respect foreign key constraints
    
    // 1. Delete tracking related data
    console.log('Deleting tracking data...')
    await supabaseClient.from('tracking_member_locations').delete().eq('user_id', userId)
    await supabaseClient.from('tracking_group_members').delete().eq('user_id', userId)
    
    // Delete tracking groups owned by user
    const { data: ownedGroups } = await supabaseClient
      .from('tracking_groups')
      .select('id')
      .eq('owner_id', userId)
    
    if (ownedGroups && ownedGroups.length > 0) {
      const groupIds = ownedGroups.map(g => g.id)
      // Delete related data from owned groups
      await supabaseClient.from('tracking_invitations').delete().in('group_id', groupIds)
      await supabaseClient.from('tracking_devices').delete().in('group_id', groupIds)
      await supabaseClient.from('gps_trackers').delete().in('group_id', groupIds)
      await supabaseClient.from('tracking_member_locations').delete().in('group_id', groupIds)
      await supabaseClient.from('tracking_group_members').delete().in('group_id', groupIds)
      await supabaseClient.from('tracking_groups').delete().in('id', groupIds)
    }

    // 2. Delete proveedor related data if exists
    if (proveedor) {
      console.log('Deleting proveedor data...')
      const proveedorId = proveedor.id
      
      // Delete productos and their photos
      const { data: productos } = await supabaseClient
        .from('productos')
        .select('id')
        .eq('proveedor_id', proveedorId)
      
      if (productos && productos.length > 0) {
        const productoIds = productos.map(p => p.id)
        await supabaseClient.from('fotos_productos').delete().in('producto_id', productoIds)
        await supabaseClient.from('items_pedido').delete().in('producto_id', productoIds)
      }
      
      await supabaseClient.from('productos').delete().eq('proveedor_id', proveedorId)
      await supabaseClient.from('pedidos').delete().eq('proveedor_id', proveedorId)
      await supabaseClient.from('proveedores').delete().eq('id', proveedorId)
    }

    // 3. Delete proveedor locations
    console.log('Deleting location data...')
    await supabaseClient.from('proveedor_locations').delete().eq('user_id', userId)

    // 4. Delete messages and chats
    console.log('Deleting messages...')
    await supabaseClient.from('messages').delete().eq('sender_id', userId)
    await supabaseClient.from('chats').delete().eq('sender_id', userId)
    await supabaseClient.from('chats').delete().eq('receiver_id', userId)

    // 5. Delete favoritos
    console.log('Deleting favoritos...')
    await supabaseClient.from('favoritos').delete().eq('user_id', userId)

    // 6. Delete user contacts
    console.log('Deleting contacts...')
    await supabaseClient.from('user_contacts').delete().eq('user_id', userId)
    await supabaseClient.from('user_contacts').delete().eq('contact_user_id', userId)

    // 7. Delete listings and photos if profile exists
    if (profile) {
      console.log('Deleting listings...')
      const { data: listings } = await supabaseClient
        .from('listings')
        .select('id')
        .eq('profile_id', profile.id)
      
      if (listings && listings.length > 0) {
        const listingIds = listings.map(l => l.id)
        await supabaseClient.from('fotos_listings').delete().in('listing_id', listingIds)
        await supabaseClient.from('favoritos').delete().in('listing_id', listingIds)
      }
      
      await supabaseClient.from('listings').delete().eq('profile_id', profile.id)
      
      // Delete job postings
      await supabaseClient.from('job_postings').delete().eq('profile_id', profile.id)
      
      // Delete subscriptions
      await supabaseClient.from('subscriptions').delete().eq('profile_id', profile.id)
      
      // Delete tracking devices
      await supabaseClient.from('tracking_devices').delete().eq('profile_id', profile.id)
    }

    // 8. Delete clientes record
    console.log('Deleting cliente record...')
    await supabaseClient.from('clientes').delete().eq('user_id', userId)

    // 9. Delete pedidos where user is cliente
    await supabaseClient.from('pedidos').delete().eq('cliente_user_id', userId)

    // 10. Delete profile
    console.log('Deleting profile...')
    await supabaseClient.from('profiles').delete().eq('user_id', userId)

    // 11. Finally, delete the auth user
    console.log('Deleting auth user...')
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId)
    
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Error al eliminar la cuenta de autenticación' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Account deleted successfully for user: ${userId}`)
    
    return new Response(
      JSON.stringify({ success: true, message: 'Cuenta eliminada exitosamente' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Error inesperado al eliminar la cuenta' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
