import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GpsTrackerSettings {
  id: string;
  tracker_id: string;
  speed_limit_kmh: number;
  speed_alert_enabled: boolean;
  low_battery_threshold: number;
  battery_alert_enabled: boolean;
  power_cut_alert_enabled: boolean;
  ignition_alert_enabled: boolean;
  offline_alert_enabled: boolean;
  offline_threshold_minutes: number;
  engine_kill_enabled: boolean;
  engine_kill_password: string | null;
  odometer_offset: number;
}

const defaultSettings: Omit<GpsTrackerSettings, 'id' | 'tracker_id'> = {
  speed_limit_kmh: 120,
  speed_alert_enabled: false,
  low_battery_threshold: 20,
  battery_alert_enabled: true,
  power_cut_alert_enabled: true,
  ignition_alert_enabled: false,
  offline_alert_enabled: true,
  offline_threshold_minutes: 30,
  engine_kill_enabled: false,
  engine_kill_password: null,
  odometer_offset: 0,
};

export const useGpsTrackerSettings = (trackerId: string | null) => {
  const [settings, setSettings] = useState<GpsTrackerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!trackerId) {
      setSettings(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gps_tracker_settings')
        .select('*')
        .eq('tracker_id', trackerId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as GpsTrackerSettings);
      } else {
        // Create default settings if none exist
        const { data: newSettings, error: insertError } = await supabase
          .from('gps_tracker_settings')
          .insert({ tracker_id: trackerId, ...defaultSettings })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings as GpsTrackerSettings);
      }
    } catch (error) {
      console.error('[GPS SETTINGS] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [trackerId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<Omit<GpsTrackerSettings, 'id' | 'tracker_id'>>) => {
    if (!trackerId || !settings) return false;

    try {
      const { error } = await supabase
        .from('gps_tracker_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('tracker_id', trackerId);

      if (error) throw error;

      setSettings(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: 'Configuración guardada' });
      return true;
    } catch (error: any) {
      console.error('[GPS SETTINGS] Error updating:', error);
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
      return false;
    }
  };

  return {
    settings,
    loading,
    updateSettings,
    refetch: fetchSettings,
  };
};
