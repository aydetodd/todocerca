import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GpsAlert {
  id: string;
  tracker_id: string;
  group_id: string;
  alert_type: string;
  title: string;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  geofence_id: string | null;
  is_read: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  // Joined data
  tracker_name?: string;
  geofence_name?: string;
}

export const useGpsAlerts = (groupId: string | null) => {
  const [alerts, setAlerts] = useState<GpsAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!groupId) {
      setAlerts([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gps_alerts')
        .select(`
          *,
          gps_trackers!inner(name),
          gps_geofences(name)
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedAlerts = (data || []).map((alert: any) => ({
        ...alert,
        tracker_name: alert.gps_trackers?.name,
        geofence_name: alert.gps_geofences?.name,
        gps_trackers: undefined,
        gps_geofences: undefined,
      }));

      setAlerts(formattedAlerts);
      setUnreadCount(formattedAlerts.filter((a: GpsAlert) => !a.is_read).length);
    } catch (error) {
      console.error('[GPS ALERTS] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchAlerts();

    if (!groupId) return;

    // Subscribe to new alerts
    const channel = supabase
      .channel('gps-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_alerts',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          console.log('[GPS ALERTS] New alert received');
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchAlerts]);

  const markAsRead = async (alertId: string) => {
    try {
      await supabase
        .from('gps_alerts')
        .update({ is_read: true })
        .eq('id', alertId);

      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, is_read: true } : a
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('[GPS ALERTS] Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!groupId) return;

    try {
      await supabase
        .from('gps_alerts')
        .update({ is_read: true })
        .eq('group_id', groupId)
        .eq('is_read', false);

      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('[GPS ALERTS] Error marking all as read:', error);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from('gps_alerts')
        .update({ 
          is_resolved: true, 
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id 
        })
        .eq('id', alertId);

      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } : a
      ));
    } catch (error) {
      console.error('[GPS ALERTS] Error resolving:', error);
    }
  };

  return {
    alerts,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    resolveAlert,
    refetch: fetchAlerts,
  };
};
