import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GpsTracker {
  id: string;
  group_id: string;
  imei: string;
  name: string;
  model: string | null;
  is_active: boolean | null;
  battery_level: number | null;
  last_seen: string | null;
  created_at: string;
  // New enhanced fields
  ignition: boolean | null;
  engine_blocked: boolean | null;
  odometer: number | null;
  external_voltage: number | null;
  gsm_signal: number | null;
  satellites: number | null;
  // Location data (joined)
  latitude?: number;
  longitude?: number;
  speed?: number;
  altitude?: number;
  course?: number;
  location_updated_at?: string;
}

export const useGpsTrackers = (groupId: string | null) => {
  const [trackers, setTrackers] = useState<GpsTracker[]>([]);
  const [allTrackers, setAllTrackers] = useState<GpsTracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const { toast } = useToast();

  const fetchTrackers = useCallback(async () => {
    if (!groupId) {
      setTrackers([]);
      setAllTrackers([]);
      setLoading(false);
      return;
    }

    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTrackers([]);
        setAllTrackers([]);
        setLoading(false);
        return;
      }

      // 2. Check if user is owner of the group
      const { data: groupData } = await supabase
        .from('tracking_groups')
        .select('owner_id')
        .eq('id', groupId)
        .single();

      const userIsOwner = groupData?.owner_id === user.id;
      setIsOwner(userIsOwner);

      // 3. Fetch all trackers with their latest location
      const { data: trackersData, error } = await supabase
        .from('gps_trackers')
        .select(`
          *,
          gps_tracker_locations (
            latitude,
            longitude,
            speed,
            updated_at
          )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flatten the location data (PostgREST may return object for 1:1 relationships)
      const flattenedTrackers = (trackersData || []).map((tracker: any) => {
        const nested = tracker.gps_tracker_locations;
        const location = Array.isArray(nested) ? nested[0] : nested;

        return {
          ...tracker,
          latitude: location?.latitude ?? undefined,
          longitude: location?.longitude ?? undefined,
          speed: location?.speed ?? undefined,
          altitude: location?.altitude ?? undefined,
          course: location?.course ?? undefined,
          location_updated_at: location?.updated_at ?? undefined,
          gps_tracker_locations: undefined,
        } as GpsTracker;
      });

      setAllTrackers(flattenedTrackers);

      // 4. If owner, show all trackers. Otherwise filter by sub-group membership.
      if (userIsOwner) {
        setTrackers(flattenedTrackers);
      } else {
        // Get member ID for current user in this group
        const { data: memberData } = await supabase
          .from('tracking_group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .single();

        if (!memberData) {
          setTrackers([]);
          setLoading(false);
          return;
        }

        // Get subgroups where this member is assigned
        const { data: memberSubgroups } = await supabase
          .from('gps_tracker_subgroup_members')
          .select('subgroup_id')
          .eq('member_id', memberData.id);

        const subgroupIds = (memberSubgroups || []).map(s => s.subgroup_id);

        if (subgroupIds.length === 0) {
          // No subgroups assigned = no trackers visible (unless owner, handled above)
          setTrackers([]);
        } else {
          // Get tracker IDs from those subgroups
          const { data: subgroupDevices } = await supabase
            .from('gps_tracker_subgroup_devices')
            .select('tracker_id')
            .in('subgroup_id', subgroupIds);

          const visibleTrackerIds = new Set((subgroupDevices || []).map(d => d.tracker_id));
          const filteredTrackers = flattenedTrackers.filter(t => visibleTrackerIds.has(t.id));
          setTrackers(filteredTrackers);
        }
      }
    } catch (error: any) {
      console.error('[GPS TRACKERS] Error fetching:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los rastreadores GPS',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [groupId, toast]);

  useEffect(() => {
    fetchTrackers();

    if (!groupId) return;

    // Subscribe to tracker changes
    const trackersChannel = supabase
      .channel('gps-trackers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gps_trackers',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          console.log('[GPS TRACKERS] Tracker updated, refetching...');
          fetchTrackers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gps_tracker_locations',
        },
        () => {
          console.log('[GPS TRACKERS] Location updated, refetching...');
          fetchTrackers();
        }
      )
      .subscribe();

    // Polling cada 30 segundos para asegurar datos frescos
    const pollInterval = setInterval(() => {
      console.log('[GPS TRACKERS] Polling for updates...');
      fetchTrackers();
    }, 30000);

    return () => {
      supabase.removeChannel(trackersChannel);
      clearInterval(pollInterval);
    };
  }, [groupId]);

  const addTracker = async (imei: string, name: string, model: string = 'GT06') => {
    if (!groupId) {
      toast({
        title: 'Error',
        description: 'No hay grupo seleccionado',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from('gps_trackers')
        .insert({
          group_id: groupId,
          imei: imei.trim(),
          name: name.trim(),
          model,
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Error',
            description: 'Este IMEI ya está registrado en otro grupo',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return false;
      }

      toast({
        title: '¡Rastreador registrado!',
        description: `${name} ha sido añadido al grupo`,
      });

      await fetchTrackers();
      return true;
    } catch (error: any) {
      console.error('[GPS TRACKERS] Error adding:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo registrar el rastreador',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeTracker = async (trackerId: string) => {
    try {
      const { error } = await supabase
        .from('gps_trackers')
        .delete()
        .eq('id', trackerId);

      if (error) throw error;

      toast({
        title: 'Rastreador eliminado',
        description: 'El dispositivo ha sido removido del grupo',
      });

      await fetchTrackers();
      return true;
    } catch (error: any) {
      console.error('[GPS TRACKERS] Error removing:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el rastreador',
        variant: 'destructive',
      });
      return false;
    }
  };

  const toggleTrackerActive = async (trackerId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('gps_trackers')
        .update({ is_active: isActive })
        .eq('id', trackerId);

      if (error) throw error;

      toast({
        title: isActive ? 'Rastreador activado' : 'Rastreador desactivado',
      });

      await fetchTrackers();
      return true;
    } catch (error: any) {
      console.error('[GPS TRACKERS] Error toggling:', error);
      return false;
    }
  };

  return {
    trackers,
    allTrackers, // All trackers (for owner use in sub-group management)
    loading,
    isOwner,
    addTracker,
    removeTracker,
    toggleTrackerActive,
    refetch: fetchTrackers,
  };
};
