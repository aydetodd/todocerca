import { useEffect, useState } from 'react';
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

  useEffect(() => {
    // Fetch initial locations
    const fetchLocations = async () => {
      console.log('🔄 [RealtimeLocations] Fetching all locations...');
      
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

      console.log('📊 [RealtimeLocations] Profiles found:', profilesData?.length || 0);
      profilesData?.forEach(p => {
        console.log(`   👤 ${p.apodo}: estado=${p.estado}`);
      });

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
      
      // Build query to check for taxi products (by name, keywords, OR category)
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

      // Merge data
      const merged = locationsData?.map(loc => {
        const profile = profilesWithActiveSub?.find(p => p.user_id === loc.user_id);
        const proveedorId = proveedorMap.get(loc.user_id);
        const isTaxi = proveedorId ? taxiProviderIds.has(proveedorId) : false;
        
        return {
          ...loc,
          profiles: profile ? {
            apodo: profile.apodo,
            estado: profile.estado as 'available' | 'busy' | 'offline',
            telefono: profile.telefono
          } : null,
          is_taxi: isTaxi
        };
      }) || [];

      // Only show users with active subscription, provider role, and available/busy status
      const filtered = merged.filter(l => l.profiles) as ProveedorLocation[];
      console.log('✅ [RealtimeLocations] Final locations:', filtered.length);
      filtered.forEach(loc => {
        console.log(`   🚕 ${loc.profiles?.apodo}: estado=${loc.profiles?.estado}, is_taxi=${loc.is_taxi}`);
      });
      setLocations(filtered);
      setLoading(false);
    };

    fetchLocations();

    // Subscribe to realtime changes - using unique channel name
    const channelId = `locations_v3_${Date.now()}`;
    console.log('📡 [RealtimeLocations] Creating channel:', channelId);
    
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proveedor_locations'
        },
        (payload) => {
          console.log('📍 [Realtime] Location changed, refetching...');
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
          console.log('👤 [Realtime] Profile changed:', payload.new);
          // Always refetch when profile changes - the estado filter will handle it
          fetchLocations();
        }
      )
      .subscribe((status) => {
        console.log('📡 [RealtimeLocations] Subscription status:', status);
      });

    // Polling backup every 5 seconds to ensure status changes are reflected
    const pollInterval = setInterval(() => {
      console.log('⏰ [Polling] Checking for updates...');
      fetchLocations();
    }, 5000);

    // Auto-track location for providers in native app
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
            console.log('[Capacitor Provider] New position:', position);
            updateLocation(position.latitude, position.longitude);
          });
          setWatchId(id);
          console.log('[Capacitor Provider] Auto-tracking started');
        } catch (error) {
          console.error('[Capacitor Provider] Error starting tracking:', error);
        }
      }
    };

    startProviderTracking();

    return () => {
      console.log('🔌 [RealtimeLocations] Cleaning up...');
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      if (watchId) {
        clearWatch(watchId);
      }
    };
  }, []);

  const updateLocation = async (latitude: number, longitude: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const source = isNativeApp() ? 'capacitor' : 'web';
    console.log(`[${source.toUpperCase()} Provider] Updating location:`, { latitude, longitude });

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
    } else {
      console.log(`[${source.toUpperCase()} Provider] Location updated successfully`);
    }
  };

  return { locations, loading, updateLocation };
};