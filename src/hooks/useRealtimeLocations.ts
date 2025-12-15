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
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchLocations = useCallback(async () => {
    if (!isMounted.current) return;
    
    console.log('🔄 [fetchLocations] Iniciando...');
    
    // 1. Primero obtener perfiles de proveedores activos (available o busy)
    const { data: activeProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, user_id, apodo, estado, telefono')
      .eq('role', 'proveedor')
      .in('estado', ['available', 'busy']);

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    console.log('👥 Perfiles activos:', activeProfiles?.map(p => `${p.apodo}=${p.estado}`));

    if (!activeProfiles || activeProfiles.length === 0) {
      console.log('⚠️ No hay proveedores activos');
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    const activeUserIds = activeProfiles.map(p => p.user_id);

    // 2. Obtener ubicaciones solo de proveedores activos
    const { data: locationsData, error: locError } = await supabase
      .from('proveedor_locations')
      .select('*')
      .in('user_id', activeUserIds);

    if (locError) {
      console.error('❌ Error fetching locations:', locError);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    if (!locationsData || locationsData.length === 0) {
      console.log('⚠️ No hay ubicaciones de proveedores activos');
      setLocations([]);
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }

    // 3. Obtener proveedores para verificar taxis
    const { data: proveedoresData } = await supabase
      .from('proveedores')
      .select('id, user_id')
      .in('user_id', activeUserIds);

    const proveedorMap = new Map(proveedoresData?.map(p => [p.user_id, p.id]) || []);
    const proveedorIds = proveedoresData?.map(p => p.id) || [];
    
    // 4. Verificar productos taxi
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

    // 5. Combinar datos
    const merged: ProveedorLocation[] = [];
    
    for (const loc of locationsData) {
      const profile = activeProfiles.find(p => p.user_id === loc.user_id);
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

    console.log(`✅ [fetchLocations] Final: ${merged.length} proveedores activos`);
    merged.forEach(loc => {
      console.log(`   🚕 ${loc.profiles?.apodo}: estado=${loc.profiles?.estado}`);
    });
    
    if (isMounted.current) {
      setLocations(merged);
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    
    // Carga inicial
    fetchLocations();

    // Suscripción a cambios de profiles (todos los eventos UPDATE)
    const profilesChannel = supabase
      .channel('realtime-profiles-status')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles'
        },
        (payload: any) => {
          console.log('📡 [Realtime] Profile UPDATE recibido:', payload);
          
          const newData = payload.new;
          const oldData = payload.old;
          
          // Solo procesar si es proveedor
          if (newData?.role !== 'proveedor') {
            console.log('   ➡️ Ignorado: no es proveedor');
            return;
          }
          
          // Solo refetch si el estado cambió
          if (oldData?.estado !== newData?.estado) {
            console.log(`🔄 [Realtime] ${newData.apodo}: ${oldData?.estado} → ${newData.estado}`);
            fetchLocations();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 [Profiles Channel] Subscription status:', status);
      });

    // Suscripción a cambios de ubicaciones
    const locationsChannel = supabase
      .channel('realtime-locations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedor_locations' },
        () => {
          console.log('📍 [Realtime] Location change');
          fetchLocations();
        }
      )
      .subscribe();

    // Polling como respaldo (cada 5 segundos)
    const pollInterval = setInterval(fetchLocations, 5000);

    // Auto-track para proveedores
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
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(locationsChannel);
      clearInterval(pollInterval);
      if (watchId) {
        clearWatch(watchId);
      }
    };
  }, [fetchLocations, watchId]);

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

  return { locations, loading, initialLoadDone, updateLocation };
};
