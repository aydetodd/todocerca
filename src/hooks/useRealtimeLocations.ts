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
  apodo?: string | null;
  estado?: 'available' | 'busy' | 'offline' | null;
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

  // Función para obtener ubicaciones con estado - ESPERA a tener TODO antes de mostrar
  const fetchLocations = useCallback(async () => {
    try {
      // 1. Obtener proveedores con ubicación
      const { data: proveedorLocations, error: locError } = await supabase
        .from('proveedor_locations')
        .select('*');
      
      if (locError) throw locError;

      // 2. Obtener TODOS los profiles de proveedores con su estado actual
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('user_id, apodo, nombre, estado, role')
        .eq('role', 'proveedor');
      
      if (profError) throw profError;

      if (!isMounted.current) return;

      // 3. Crear mapa de profiles para lookup rápido
      const profileMap = new Map<string, { apodo: string | null; nombre: string; estado: string | null }>();
      profiles?.forEach(p => {
        profileMap.set(p.user_id, {
          apodo: p.apodo,
          nombre: p.nombre,
          estado: p.estado
        });
      });

      // 4. Combinar y FILTRAR - solo mostrar available y busy
      const merged: ProveedorLocation[] = [];
      
      proveedorLocations?.forEach(loc => {
        const profile = profileMap.get(loc.user_id);
        
        // Solo incluir si tiene profile Y NO está offline
        if (profile && profile.estado !== 'offline') {
          merged.push({
            id: loc.id,
            user_id: loc.user_id,
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            updated_at: loc.updated_at,
            apodo: profile.apodo || profile.nombre,
            estado: profile.estado as 'available' | 'busy' | 'offline' | null
          });
        }
      });

      console.log('✅ [Locations] Cargados:', merged.length, 'proveedores activos');
      
      // Actualizar estado de una sola vez
      setLocations(merged);
      setLoading(false);
      setInitialLoadDone(true);
    } catch (error) {
      console.error('Error fetching locations:', error);
      if (isMounted.current) {
        setLoading(false);
        setInitialLoadDone(true);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    
    fetchLocations();

    // Canal para cambios de profiles - ACTUALIZACIÓN DIRECTA sin refetch
    const profilesChannel = supabase
      .channel('profiles_status_direct_' + Date.now())
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles'
        },
        (payload: any) => {
          const newData = payload.new;
          const oldData = payload.old;
          
          // Solo nos interesan los proveedores
          if (newData?.role !== 'proveedor') return;
          
          // Solo actuar si el estado cambió
          if (oldData?.estado !== newData?.estado) {
            console.log('🔴🟡🟢 [Realtime] Estado cambió:', {
              user_id: newData.user_id,
              apodo: newData.apodo,
              de: oldData?.estado,
              a: newData.estado
            });
            
            // ACTUALIZAR ESTADO LOCAL DIRECTAMENTE - sin refetch
            setLocations(prevLocations => {
              if (newData.estado === 'offline') {
                // REMOVER del array si está offline
                console.log('🚫 [Realtime] Removiendo proveedor offline:', newData.apodo);
                return prevLocations.filter(loc => loc.user_id !== newData.user_id);
              } else {
                // ACTUALIZAR el estado del proveedor existente
                return prevLocations.map(loc => {
                  if (loc.user_id === newData.user_id) {
                    console.log('✏️ [Realtime] Actualizando estado de:', newData.apodo, 'a', newData.estado);
                    return { ...loc, estado: newData.estado };
                  }
                  return loc;
                });
              }
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 [Profiles Direct] Status:', status);
      });

    // Canal para ubicaciones
    const locationsChannel = supabase
      .channel('locations_realtime_' + Date.now())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedor_locations' },
        () => {
          console.log('📍 [Realtime] Location change');
          fetchLocations();
        }
      )
      .subscribe();

    // Polling cada 3 segundos como respaldo
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
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(locationsChannel);
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

  return { locations, loading, initialLoadDone, updateLocation };
};
