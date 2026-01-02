import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GpsHistoryPoint {
  id: string;
  tracker_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  altitude: number | null;
  course: number | null;
  ignition: boolean | null;
  engine_status: boolean | null;
  odometer: number | null;
  fuel_level: number | null;
  external_voltage: number | null;
  gsm_signal: number | null;
  satellites: number | null;
  timestamp: string;
}

export interface GpsHistoryStats {
  totalDistance: number;
  maxSpeed: number;
  avgSpeed: number;
  totalTimeHours: number;
  startTime: string | null;
  endTime: string | null;
  pointsCount: number;
}

// Haversine distance in km
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const useGpsHistory = () => {
  const [history, setHistory] = useState<GpsHistoryPoint[]>([]);
  const [stats, setStats] = useState<GpsHistoryStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (
    trackerId: string,
    startDate: Date,
    endDate: Date
  ) => {
    setLoading(true);

    try {
      // Set time to start and end of day
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('gps_tracker_history')
        .select('*')
        .eq('tracker_id', trackerId)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      const points = (data || []) as GpsHistoryPoint[];
      setHistory(points);

      // Calculate stats
      if (points.length > 0) {
        let totalDistance = 0;
        const speeds = points.filter(p => p.speed !== null).map(p => p.speed!);

        for (let i = 1; i < points.length; i++) {
          totalDistance += haversineDistance(
            points[i - 1].latitude,
            points[i - 1].longitude,
            points[i].latitude,
            points[i].longitude
          );
        }

        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const totalTimeMs = new Date(lastPoint.timestamp).getTime() - new Date(firstPoint.timestamp).getTime();

        setStats({
          totalDistance,
          maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
          avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
          totalTimeHours: totalTimeMs / 1000 / 60 / 60,
          startTime: firstPoint.timestamp,
          endTime: lastPoint.timestamp,
          pointsCount: points.length,
        });
      } else {
        setStats(null);
      }
    } catch (error) {
      console.error('[GPS HISTORY] Error fetching:', error);
      setHistory([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportToCsv = (trackerName: string) => {
    if (history.length === 0) return;

    const headers = [
      'Fecha/Hora',
      'Latitud',
      'Longitud',
      'Velocidad (km/h)',
      'Altitud (m)',
      'Rumbo (°)',
      'Ignición',
      'Odómetro (km)',
      'Voltaje (V)',
      'Señal GSM',
      'Satélites',
    ];

    const rows = history.map(p => [
      new Date(p.timestamp).toLocaleString('es-MX'),
      p.latitude.toFixed(6),
      p.longitude.toFixed(6),
      p.speed?.toFixed(1) || '',
      p.altitude?.toFixed(0) || '',
      p.course?.toFixed(0) || '',
      p.ignition === true ? 'Sí' : p.ignition === false ? 'No' : '',
      p.odometer?.toFixed(1) || '',
      p.external_voltage?.toFixed(1) || '',
      p.gsm_signal || '',
      p.satellites || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historial_${trackerName}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    history,
    stats,
    loading,
    fetchHistory,
    exportToCsv,
  };
};
