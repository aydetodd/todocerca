import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp, watchPosition, clearWatch } from '@/utils/capacitorLocation';

/**
 * Hook global para tracking de ubicación de proveedores.
 * Funciona en cualquier página mientras el proveedor esté logueado.
 */
export const useProviderLocationTracking = () => {
  const watchIdRef = useRef<number | string | null>(null);
  const isTrackingRef = useRef(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const MIN_UPDATE_INTERVAL = 1500; // Throttle: 1.5 segundos entre updates

    const updateLocation = async (latitude: number, longitude: number) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL) return;
      lastUpdateRef.current = now;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[GlobalTracking] 📍', latitude.toFixed(6), longitude.toFixed(6));

      await supabase
        .from('proveedor_locations')
        .upsert({
          user_id: user.id,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
    };

    const startTracking = async () => {
      if (isTrackingRef.current) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar si es proveedor y está activo (available o busy)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, estado')
        .eq('user_id', user.id)
        .single();

      if (profile?.role !== 'proveedor') {
        console.log('[GlobalTracking] No es proveedor, tracking desactivado');
        return;
      }

      if (profile.estado === 'offline') {
        console.log('[GlobalTracking] Proveedor offline, tracking desactivado');
        return;
      }

      console.log('[GlobalTracking] 🚀 Iniciando tracking global para proveedor:', profile.estado);
      isTrackingRef.current = true;

      // Usar Capacitor si es app nativa
      if (isNativeApp()) {
        try {
          const id = await watchPosition((position) => {
            if (mounted) {
              updateLocation(position.latitude, position.longitude);
            }
          });
          watchIdRef.current = id;
          console.log('[GlobalTracking] ✅ Tracking nativo iniciado');
        } catch (error) {
          console.error('[GlobalTracking] Error tracking nativo:', error);
        }
        return;
      }

      // Usar geolocation del navegador
      if ('geolocation' in navigator) {
        // Posición inicial
        navigator.geolocation.getCurrentPosition(
          (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
          (err) => console.error('[GlobalTracking] GPS error:', err),
          { enableHighAccuracy: true }
        );

        // Watch continuo
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (mounted) {
              updateLocation(pos.coords.latitude, pos.coords.longitude);
            }
          },
          (err) => console.error('[GlobalTracking] GPS error:', err),
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );

        watchIdRef.current = watchId;
        console.log('[GlobalTracking] ✅ Tracking web iniciado');
      }
    };

    const stopTracking = () => {
      if (!isTrackingRef.current) return;

      if (isNativeApp() && typeof watchIdRef.current === 'string') {
        clearWatch(watchIdRef.current);
      } else if (typeof watchIdRef.current === 'number') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = null;
      isTrackingRef.current = false;
      console.log('[GlobalTracking] 🛑 Tracking detenido');
    };

    // Iniciar tracking
    startTracking();

    // Escuchar cambios de estado del proveedor
    const channel = supabase
      .channel('provider-status-tracking')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async (payload: any) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || payload.new.user_id !== user.id) return;

          const newEstado = payload.new.estado;
          console.log('[GlobalTracking] Estado cambió:', newEstado);

          if (newEstado === 'offline') {
            stopTracking();
          } else if (!isTrackingRef.current) {
            startTracking();
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      stopTracking();
      supabase.removeChannel(channel);
    };
  }, []);
};
