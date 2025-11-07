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
  is_taxi?: boolean;
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

      // Fetch profiles for all users - only providers with available/busy status
      const userIds = locationsData?.map(l => l.user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, user_id, apodo, estado, telefono, role')
        .in('user_id', userIds)
        .eq('role', 'proveedor')
        .in('estado', ['available', 'busy']);

      if (!profilesData || profilesData.length === 0) {
        setLocations([]);
        setLoading(false);
        return;
      }

      // Get profile IDs to check subscriptions
      const profileIds = profilesData.map(p => p.id);
      const { data: subscriptionsData } = await supabase
        .from('subscriptions')
        .select('profile_id, status, end_date')
        .in('profile_id', profileIds)
        .eq('status', 'activa');

      // Filter profiles with active subscriptions
      const profilesWithActiveSub = profilesData.filter(profile => {
        const subscription = subscriptionsData?.find(s => s.profile_id === profile.id);
        if (!subscription) return false;
        // Check if subscription hasn't ended
        if (subscription.end_date) {
          return new Date(subscription.end_date) > new Date();
        }
        return true;
      });

      // Get provider IDs to check for taxi services
      const { data: proveedoresData } = await supabase
        .from('proveedores')
        .select('id, user_id')
        .in('user_id', userIds);

      const proveedorMap = new Map(proveedoresData?.map(p => [p.user_id, p.id]) || []);
      
      // Check which providers have taxi products
      const proveedorIds = proveedoresData?.map(p => p.id) || [];
      
      // First, get the Taxi category ID
      const { data: taxiCategory } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', 'taxi')
        .maybeSingle();
      
      console.log('Taxi category found:', taxiCategory);
      
      // Build query to check for taxi products (by name, keywords, OR category)
      let taxiQuery = supabase
        .from('productos')
        .select('proveedor_id')
        .in('proveedor_id', proveedorIds);
      
      if (taxiCategory?.id) {
        // Search by category OR by name/keywords
        taxiQuery = taxiQuery.or(`category_id.eq.${taxiCategory.id},nombre.ilike.%taxi%,keywords.ilike.%taxi%`);
      } else {
        // Fallback to name/keywords only if no category found
        taxiQuery = taxiQuery.or('nombre.ilike.%taxi%,keywords.ilike.%taxi%');
      }
      
      const { data: taxiProducts } = await taxiQuery;
      console.log('Taxi products found:', taxiProducts);
      
      const taxiProviderIds = new Set(taxiProducts?.map(p => p.proveedor_id) || []);

      // Merge data
      const merged = locationsData?.map(loc => {
        const profile = profilesWithActiveSub?.find(p => p.user_id === loc.user_id);
        const proveedorId = proveedorMap.get(loc.user_id);
        const isTaxi = proveedorId ? taxiProviderIds.has(proveedorId) : false;
        
        return {
          ...loc,
          profiles: profile || null,
          is_taxi: isTaxi
        };
      }) || [];

      // Only show users with active subscription, provider role, and available/busy status
      const filtered = merged.filter(l => l.profiles) as ProveedorLocation[];
      console.log('📍 [RealtimeMap] Locations updated:', filtered.length, 'providers');
      filtered.forEach(loc => {
        console.log(`  - ${loc.profiles?.apodo} (${loc.is_taxi ? '🚕 TAXI' : '👤'}): [${loc.latitude}, ${loc.longitude}]`);
      });
      setLocations(filtered);
      setLoading(false);
    };

    fetchLocations();

    // Subscribe to realtime changes - simplified like TrackingMap
    const channel = supabase
      .channel('proveedor_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proveedor_locations'
        },
        (payload) => {
          console.log('🚕 [RealtimeMap] proveedor_locations CHANGED:', payload);
          console.log('🔄 Refetching all locations...');
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
          console.log('👤 [RealtimeMap] profiles changed:', payload);
          fetchLocations();
        }
      )
      .subscribe((status) => {
        console.log('📡 [RealtimeMap] Subscription status:', status);
      });

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