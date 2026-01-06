import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/utils/capacitorLocation';

export interface MemberLocation {
  id: string;
  user_id: string;
  group_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  member?: {
    nickname: string;
    is_owner: boolean;
    estado?: string;
  };
}

export const useTrackingLocations = (groupId: string | null) => {
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const groupMemberUserIds = useRef<string[]>([]);

  const fetchLocations = useCallback(async () => {
    if (!groupId) return;

    try {
      // Primero obtener los miembros del grupo para saber qué user_ids monitorear
      const { data: membersData, error: membersError } = await supabase
        .from('tracking_group_members')
        .select('user_id, nickname, is_owner')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      const memberUserIds = membersData?.map(m => m.user_id) || [];
      groupMemberUserIds.current = memberUserIds;

      if (memberUserIds.length === 0) {
        setLocations([]);
        return;
      }

      // Obtener ubicaciones
      const { data: locationsData, error: locError } = await supabase
        .from('tracking_member_locations')
        .select('*')
        .eq('group_id', groupId);

      if (locError) throw locError;

      // Obtener estados de usuarios desde profiles (solo los del grupo)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, estado')
        .in('user_id', memberUserIds);

      if (profilesError) throw profilesError;

      console.log('[REALTIME] Fetched data:', {
        members: membersData?.length,
        locations: locationsData?.length,
        profiles: profilesData?.map(p => ({ user_id: p.user_id.slice(-6), estado: p.estado }))
      });

      // Combinar datos y filtrar por estado (solo mostrar si NO está offline)
      const merged = locationsData?.map(loc => {
        const member = membersData?.find(m => m.user_id === loc.user_id);
        const profile = profilesData?.find(p => p.user_id === loc.user_id);
        
        return {
          ...loc,
          member: member ? {
            ...member,
            estado: profile?.estado
          } : undefined
        };
      }).filter(loc => {
        // Solo mostrar si el estado NO es offline (rojo)
        const estado = loc.member?.estado;
        const shouldShow = estado !== 'offline';
        console.log('[REALTIME] Filter:', loc.member?.nickname, 'estado:', estado, 'show:', shouldShow);
        return shouldShow;
      }) || [];

      console.log('[REALTIME] Final count:', merged.length);
      setLocations(merged);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    // Fetch inicial
    fetchLocations();

    // Crear un canal único para este grupo
    const channelName = `tracking_realtime_${groupId}_${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_member_locations',
          filter: `group_id=eq.${groupId}`
        },
        (payload) => {
          console.log('[REALTIME] Location change detected:', payload.eventType);
          fetchLocations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          // Solo refrescar si el usuario actualizado está en nuestro grupo
          const updatedUserId = (payload.new as any)?.user_id;
          if (updatedUserId && groupMemberUserIds.current.includes(updatedUserId)) {
            console.log('[REALTIME] Profile update for group member:', updatedUserId.slice(-6), 'new estado:', (payload.new as any)?.estado);
            // Pequeño delay para asegurar que la BD esté sincronizada
            setTimeout(() => {
              fetchLocations();
            }, 100);
          }
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
      });

    return () => {
      console.log('[REALTIME] Cleaning up channel:', channelName);
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchLocations]);

  const updateMyLocation = async (latitude: number, longitude: number) => {
    if (!groupId) {
      console.log('[DEBUG] No groupId, cannot update location');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[DEBUG] No user found');
        return;
      }

      const source = isNativeApp() ? 'capacitor' : 'web';
      console.log(`[${source.toUpperCase()}] Updating location:`, {
        user_id: user.id,
        group_id: groupId,
        latitude,
        longitude
      });

      // Actualizar en tracking_member_locations
      const { data, error } = await supabase
        .from('tracking_member_locations')
        .upsert({
          user_id: user.id,
          group_id: groupId,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,group_id'
        })
        .select();

      if (error) {
        console.error('[DEBUG] Error updating tracking location:', error);
        throw error;
      }
      
      console.log('[DEBUG] Tracking location updated successfully:', data);

      // TAMBIÉN actualizar en proveedor_locations para que aparezca en el mapa de proveedores
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profileData?.role === 'proveedor') {
        const { error: proveedorError } = await supabase
          .from('proveedor_locations')
          .upsert({
            user_id: user.id,
            latitude,
            longitude,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (proveedorError) {
          console.error('[DEBUG] Error updating proveedor location:', proveedorError);
        } else {
          console.log('[DEBUG] ✅ Proveedor location ALSO updated for taxi map');
        }
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  return {
    locations,
    loading,
    updateMyLocation
  };
};
