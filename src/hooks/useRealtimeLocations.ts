import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isNativeApp, 
  watchPosition, 
  clearWatch 
} from '@/utils/capacitorLocation';

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
  const [watchId, setWatchId] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchLocations = useCallback(async () => {
    if (!isMounted.current) return;
    
    console.log('🔄 [Locations] Fetching...');
    
    // 1. Get all provider locations
    const { data: locationsData, error: locError } = await supabase
      .from('proveedor_locations')
      .select('*');

    if (locError) {
      console.error('Error fetching locations:', locError);
      setLoading(false);
      return;
    }

    if (!locationsData || locationsData.length === 0) {
      console.log('📍 [Locations] No locations found');
      setLocations([]);
      setLoading(false);
      return;
    }

    const userIds = locationsData.map(l => l.user_id);
    
    // 2. Get profiles - FRESH query cada vez, solo available/busy proveedores
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, user_id, apodo, estado, telefono, role')
      .in('user_id', userIds)
      .eq('role', 'proveedor')
      .in('estado', ['available', 'busy']);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      setLoading(false);
      return;
    }

    console.log('👤 [Profiles]', profilesData?.length || 0, 'found:');
    profilesData?.forEach(p => {
      console.log(`   - ${p.apodo}: estado=${p.estado}`);
    });

    if (!profilesData || profilesData.length === 0) {
      setLocations([]);
      setLoading(false);
      return;
    }

    // 3. Check active subscriptions
    const profileIds = profilesData.map(p => p.id);
    const { data: subscriptionsData } = await supabase
      .from('subscriptions')
      .select('profile_id, status, end_date')
      .in('profile_id', profileIds)
      .eq('status', 'activa');

    const profilesWithActiveSub = profilesData.filter(profile => {
      const subscription = subscriptionsData?.find(s => s.profile_id === profile.id);
      if (!subscription) return false;
      if (subscription.end_date) {
        return new Date(subscription.end_date) > new Date();
      }
      return true;
    });

    // 4. Get provider IDs for taxi check
    const { data: proveedoresData } = await supabase
      .from('proveedores')
      .select('id, user_id')
      .in('user_id', userIds);

    const proveedorMap = new Map(proveedoresData?.map(p => [p.user_id, p.id]) || []);
    const proveedorIds = proveedoresData?.map(p => p.id) || [];
    
    // 5. Check for taxi products
    const { data: taxiCategory } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', 'taxi')
      .maybeSingle();
    
    let taxiQuery = supabase
      .from('productos')
      .select('proveedor_id')
      .in('proveedor_id', proveedorIds);
    
    if (taxiCategory?.id) {
      taxiQuery = taxiQuery.or(`category_id.eq.${taxiCategory.id},nombre.ilike.%taxi%,keywords.ilike.%taxi%`);
    } else {
      taxiQuery = taxiQuery.or('nombre.ilike.%taxi%,keywords.ilike.%taxi%');
    }
    
    const { data: taxiProducts } = await taxiQuery;
    const taxiProviderIds = new Set(taxiProducts?.map(p => p.proveedor_id) || []);

    // 6. Merge data - usar profilesWithActiveSub directamente
    const merged: ProveedorLocation[] = [];
    
    for (const loc of locationsData) {
      const profile = profilesWithActiveSub.find(p => p.user_id === loc.user_id);
      
      // Solo incluir si tiene perfil activo (ya filtrado por available/busy)
      if (!profile) continue;
      
      const proveedorId = proveedorMap.get(loc.user_id);
      const isTaxi = proveedorId ? taxiProviderIds.has(proveedorId) : false;
      
      merged.push({
        ...loc,
        profiles: {
          apodo: profile.apodo,
          estado: profile.estado as 'available' | 'busy' | 'offline',
          telefono: profile.telefono
        },
        is_taxi: isTaxi
      });
    }

    console.log('✅ [Locations] Final:', merged.length);
    merged.forEach(loc => {
      console.log(`   🚕 ${loc.profiles?.apodo}: estado=${loc.profiles?.estado}`);
    });
    
    if (isMounted.current) {
      setLocations(merged);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    
    fetchLocations();

    // Realtime subscription
    const channel = supabase
      .channel('locations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedor_locations' },
        () => {
          console.log('📍 [Realtime] Location change');
          fetchLocations();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          console.log('👤 [Realtime] Profile UPDATE:', payload.new);
          // Refetch para obtener el estado actualizado
          fetchLocations();
        }
      )
      .subscribe((status) => {
        console.log('📡 [Subscription]', status);
      });

    // Polling cada 3 segundos para asegurar actualizaciones
    const pollInterval = setInterval(fetchLocations, 3000);

    // Auto-track for providers
    const startProviderTracking = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role === 'proveedor' && isNativeApp()) {
        try {
          const id = await watchPosition((position) => {
            updateLocation(position.latitude, position.longitude);
          });
          setWatchId(id);
        } catch (error) {
          console.error('[Provider Tracking] Error:', error);
        }
      }
    };

    startProviderTracking();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      if (watchId) {
        clearWatch(watchId);
      }
    };
  }, [fetchLocations]);

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
