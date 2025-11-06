import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

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
        return estado !== 'offline';
      }) || [];

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

      console.log('[DEBUG] Updating location:', {
        user_id: user.id,
        group_id: groupId,
        latitude,
        longitude
      });

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
        console.error('[DEBUG] Error updating location:', error);
        throw error;
      }
      
      console.log('[DEBUG] Location updated successfully:', data);
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
