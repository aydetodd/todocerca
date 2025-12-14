import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isNativeApp, 
  getCurrentPosition, 
  watchPosition, 
  clearWatch 
} from '@/utils/capacitorLocation';

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
  const [watchId, setWatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    fetchLocations();

    // Suscribirse a cambios en tiempo real en ubicaciones Y estados de usuarios
    const channel = supabase
      .channel('tracking_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracking_member_locations',
          filter: `group_id=eq.${groupId}`
        },
        () => {
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
        () => {
          // Refrescar cuando cambie el estado de cualquier usuario
          fetchLocations();
        }
      )
      .subscribe();

    // Iniciar tracking automático de ubicación si es app nativa
    if (isNativeApp()) {
      startLocationTracking();
    }

    return () => {
      supabase.removeChannel(channel);
      // Limpiar tracking al desmontar
      if (watchId) {
        clearWatch(watchId);
      }
    };
  }, [groupId]);

  const startLocationTracking = async () => {
    try {
      const id = await watchPosition((position) => {
        console.log('[Capacitor] New position:', position);
        updateMyLocation(position.latitude, position.longitude);
      });
      setWatchId(id);
      console.log('[Capacitor] Location tracking started with watch ID:', id);
    } catch (error) {
      console.error('[Capacitor] Error starting location tracking:', error);
    }
  };

  const fetchLocations = async () => {
    if (!groupId) return;

    try {
      const { data: locationsData, error: locError } = await supabase
        .from('tracking_member_locations')
        .select('*')
        .eq('group_id', groupId);

      if (locError) throw locError;

      console.log('[DEBUG] Fetched locations:', locationsData);

      // Obtener info de miembros
      const { data: membersData, error: membersError } = await supabase
        .from('tracking_group_members')
        .select('user_id, nickname, is_owner')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      console.log('[DEBUG] Fetched members:', membersData);

      // Obtener estados de usuarios desde profiles
      const userIds = locationsData?.map(loc => loc.user_id) || [];
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, estado')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      console.log('[DEBUG] Fetched profiles:', profilesData);

      // Combinar datos y filtrar por estado (solo mostrar si NO está offline)
      const merged = locationsData?.map(loc => {
        const member = membersData?.find(m => m.user_id === loc.user_id);
        const profile = profilesData?.find(p => p.user_id === loc.user_id);
        
        const locationWithMember = {
          ...loc,
          member: member ? {
            ...member,
            estado: profile?.estado
          } : undefined
        };
        
        console.log('[DEBUG] Location for user', loc.user_id, ':', {
          nickname: member?.nickname,
          estado: profile?.estado,
          willBeFiltered: profile?.estado === 'offline'
        });
        
        return locationWithMember;
      }).filter(loc => {
        // Solo mostrar si el estado NO es offline (rojo)
        const estado = loc.member?.estado;
        const shouldShow = estado !== 'offline';
        console.log('[DEBUG] Filtering:', loc.member?.nickname, 'estado:', estado, 'shouldShow:', shouldShow);
        return shouldShow;
      }) || [];

      console.log('[DEBUG] Final filtered locations count:', merged.length);
      console.log('[DEBUG] Merged and filtered locations:', merged);
      setLocations(merged);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

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
