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

    // Suscribirse a cambios en tiempo real
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

      // Combinar datos
      const merged = locationsData?.map(loc => ({
        ...loc,
        member: membersData?.find(m => m.user_id === loc.user_id)
      })) || [];

      console.log('[DEBUG] Merged locations:', merged);
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
