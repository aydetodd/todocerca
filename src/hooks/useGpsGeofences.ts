import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GpsGeofence {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  fence_type: 'circle' | 'polygon';
  center_lat: number | null;
  center_lng: number | null;
  radius_meters: number | null;
  polygon_points: Array<{ lat: number; lng: number }> | null;
  alert_on_enter: boolean;
  alert_on_exit: boolean;
  is_active: boolean;
  created_at: string;
  // Assigned trackers count
  trackers_count?: number;
}

export interface GeofenceInput {
  name: string;
  description?: string;
  fence_type: 'circle' | 'polygon';
  center_lat?: number;
  center_lng?: number;
  radius_meters?: number;
  polygon_points?: Array<{ lat: number; lng: number }>;
  alert_on_enter?: boolean;
  alert_on_exit?: boolean;
}

export const useGpsGeofences = (groupId: string | null) => {
  const [geofences, setGeofences] = useState<GpsGeofence[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGeofences = useCallback(async () => {
    if (!groupId) {
      setGeofences([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gps_geofences')
        .select(`
          *,
          gps_tracker_geofences(count)
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((g: any) => ({
        ...g,
        trackers_count: g.gps_tracker_geofences?.[0]?.count || 0,
        gps_tracker_geofences: undefined,
      }));

      setGeofences(formatted);
    } catch (error) {
      console.error('[GPS GEOFENCES] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  const createGeofence = async (input: GeofenceInput) => {
    if (!groupId) {
      toast({ title: 'Error', description: 'No hay grupo seleccionado', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('gps_geofences')
        .insert({
          group_id: groupId,
          name: input.name,
          description: input.description || null,
          fence_type: input.fence_type,
          center_lat: input.center_lat || null,
          center_lng: input.center_lng || null,
          radius_meters: input.radius_meters || null,
          polygon_points: input.polygon_points || null,
          alert_on_enter: input.alert_on_enter ?? false,
          alert_on_exit: input.alert_on_exit ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Geocerca creada', description: `"${input.name}" ha sido creada` });
      await fetchGeofences();
      return data;
    } catch (error: any) {
      console.error('[GPS GEOFENCES] Error creating:', error);
      toast({ title: 'Error', description: 'No se pudo crear la geocerca', variant: 'destructive' });
      return null;
    }
  };

  const updateGeofence = async (id: string, input: Partial<GeofenceInput>) => {
    try {
      const { error } = await supabase
        .from('gps_geofences')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Geocerca actualizada' });
      await fetchGeofences();
      return true;
    } catch (error: any) {
      console.error('[GPS GEOFENCES] Error updating:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
      return false;
    }
  };

  const deleteGeofence = async (id: string) => {
    try {
      const { error } = await supabase
        .from('gps_geofences')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Geocerca eliminada' });
      await fetchGeofences();
      return true;
    } catch (error: any) {
      console.error('[GPS GEOFENCES] Error deleting:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
      return false;
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('gps_geofences')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await fetchGeofences();
      return true;
    } catch (error) {
      console.error('[GPS GEOFENCES] Error toggling:', error);
      return false;
    }
  };

  const assignToTracker = async (geofenceId: string, trackerId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_geofences')
        .insert({ geofence_id: geofenceId, tracker_id: trackerId });

      if (error && error.code !== '23505') throw error; // Ignore duplicate

      toast({ title: 'Geocerca asignada al dispositivo' });
      await fetchGeofences();
      return true;
    } catch (error: any) {
      console.error('[GPS GEOFENCES] Error assigning:', error);
      toast({ title: 'Error', description: 'No se pudo asignar', variant: 'destructive' });
      return false;
    }
  };

  const unassignFromTracker = async (geofenceId: string, trackerId: string) => {
    try {
      const { error } = await supabase
        .from('gps_tracker_geofences')
        .delete()
        .eq('geofence_id', geofenceId)
        .eq('tracker_id', trackerId);

      if (error) throw error;

      toast({ title: 'Geocerca removida del dispositivo' });
      await fetchGeofences();
      return true;
    } catch (error: any) {
      console.error('[GPS GEOFENCES] Error unassigning:', error);
      return false;
    }
  };

  return {
    geofences,
    loading,
    createGeofence,
    updateGeofence,
    deleteGeofence,
    toggleActive,
    assignToTracker,
    unassignFromTracker,
    refetch: fetchGeofences,
  };
};
