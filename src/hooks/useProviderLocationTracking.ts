import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp, watchPosition, clearWatch, getCurrentPosition } from '@/utils/capacitorLocation';

/**
 * Hook global para tracking de ubicación de proveedores.
 * Funciona en cualquier página mientras el proveedor esté logueado.
 * Usa polling activo cada 1.5 segundos para garantizar actualizaciones continuas.
 */
export const useProviderLocationTracking = () => {
  const watchIdRef = useRef<number | string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTrackingRef = useRef(false);
  const lastUpdateRef = useRef(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    const UPDATE_INTERVAL = 1500; // 1.5 segundos entre updates forzados

    const updateLocation = async (latitude: number, longitude: number) => {
      const now = Date.now();
      // Evitar actualizaciones muy frecuentes
      if (now - lastUpdateRef.current < 1000) return;
      lastUpdateRef.current = now;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        console.log('[GlobalTracking] 📍 Actualizando:', latitude.toFixed(6), longitude.toFixed(6));

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
          console.error('[GlobalTracking] Error actualizando ubicación:', error);
        }
      } catch (err) {
        console.error('[GlobalTracking] Exception:', err);
      }
    };

    // Función para obtener y enviar ubicación actual
    const pollLocation = () => {
      if (!mounted || !isTrackingRef.current) return;

      if (isNativeApp()) {
        getCurrentPosition()
          .then(pos => {
            if (mounted && isTrackingRef.current) {
              updateLocation(pos.latitude, pos.longitude);
            }
          })
          .catch(err => console.error('[GlobalTracking] Poll nativo error:', err));
      } else if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (mounted && isTrackingRef.current) {
              updateLocation(pos.coords.latitude, pos.coords.longitude);
            }
          },
          (err) => console.error('[GlobalTracking] Poll GPS error:', err),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    };

    const startTracking = async () => {
      if (isTrackingRef.current) {
        console.log('[GlobalTracking] Ya está activo');
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[GlobalTracking] No hay usuario logueado');
          return;
        }

        // Verificar si es proveedor y está activo (available o busy)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, estado')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          console.error('[GlobalTracking] Error obteniendo perfil:', profileError);
          return;
        }

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
        setIsActive(true);

        // Obtener posición inicial inmediatamente
        pollLocation();

        // POLLING ACTIVO cada 1.5 segundos - esto garantiza actualizaciones continuas
        pollIntervalRef.current = setInterval(pollLocation, UPDATE_INTERVAL);
        console.log('[GlobalTracking] ✅ Polling activo iniciado cada', UPDATE_INTERVAL, 'ms');

        // Usar Capacitor si es app nativa (adicional al polling)
        if (isNativeApp()) {
          try {
            const id = await watchPosition((position) => {
              if (mounted && isTrackingRef.current) {
                updateLocation(position.latitude, position.longitude);
              }
            });
            watchIdRef.current = id;
            console.log('[GlobalTracking] ✅ Watch nativo también activo');
          } catch (error) {
            console.error('[GlobalTracking] Error watch nativo:', error);
          }
          return;
        }

        // También usar watchPosition como respaldo (además del polling)
        if ('geolocation' in navigator) {
          const watchId = navigator.geolocation.watchPosition(
            (pos) => {
              if (mounted && isTrackingRef.current) {
                updateLocation(pos.coords.latitude, pos.coords.longitude);
              }
            },
            (err) => console.error('[GlobalTracking] Watch error:', err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
          watchIdRef.current = watchId;
          console.log('[GlobalTracking] ✅ Watch web también activo');
        }
      } catch (err) {
        console.error('[GlobalTracking] Exception en startTracking:', err);
      }
    };

    const stopTracking = () => {
      if (!isTrackingRef.current) return;

      console.log('[GlobalTracking] 🛑 Deteniendo tracking...');

      // Limpiar polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      // Limpiar watch
      if (isNativeApp() && typeof watchIdRef.current === 'string') {
        clearWatch(watchIdRef.current);
      } else if (typeof watchIdRef.current === 'number') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = null;
      isTrackingRef.current = false;
      setIsActive(false);
    };

    // Iniciar tracking inmediatamente
    startTracking();

    // Re-verificar cada 30 segundos en caso de que el estado cambie
    const checkInterval = setInterval(() => {
      if (!isTrackingRef.current) {
        startTracking();
      }
    }, 30000);

    // Escuchar cambios de estado del proveedor
    const channel = supabase
      .channel('global-provider-status-tracking')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async (payload: any) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || payload.new.user_id !== user.id) return;

          const newEstado = payload.new.estado;
          console.log('[GlobalTracking] Estado cambió a:', newEstado);

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
      clearInterval(checkInterval);
      stopTracking();
      supabase.removeChannel(channel);
    };
  }, []);

  return { isActive };
};
