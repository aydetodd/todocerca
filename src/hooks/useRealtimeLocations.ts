import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProveedorLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  profiles?: {
    apodo: string | null;
    estado: 'available' | 'busy' | 'offline';
    telefono: string | null;
  };
}

export const useRealtimeLocations = () => {
  const [locations, setLocations] = useState<ProveedorLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial locations
    const fetchLocations = async () => {
      const { data: locationsData, error: locError } = await supabase
        .from('proveedor_locations')
        .select('*');

      if (locError) {
        console.error('Error fetching locations:', locError);
        setLoading(false);
        return;
      }

      // Fetch profiles for all users - only available and busy users
      const userIds = locationsData?.map(l => l.user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, apodo, estado, telefono')
        .in('user_id', userIds)
        .in('estado', ['available', 'busy']);

      // Merge data
      const merged = locationsData?.map(loc => ({
        ...loc,
        profiles: profilesData?.find(p => p.user_id === loc.user_id) || null
      })) || [];

      // Only show users with available or busy status
      setLocations(merged.filter(l => l.profiles) as ProveedorLocation[]);
      setLoading(false);
    };

    fetchLocations();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('proveedor_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proveedor_locations'
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
          fetchLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateLocation = async (latitude: number, longitude: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('proveedor_locations')
      .upsert({
        user_id: user.id,
        latitude,
        longitude,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error updating location:', error);
    }
  };

  return { locations, loading, updateLocation };
};