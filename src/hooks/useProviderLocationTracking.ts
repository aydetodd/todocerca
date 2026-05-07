import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { isPermissionConfigured, resetPermissionConfigured } from '@/components/LocationPermissionGuide';
import { BackgroundGeolocation } from '@/integrations/capacitor/backgroundGeolocation';

/**
 * Hook global para tracking de ubicación de proveedores.
 * Funciona en cualquier página mientras el proveedor esté logueado.
 * En app nativa usa foreground service para funcionar con pantalla apagada.
 */
export const useProviderLocationTracking = () => {
  const watcherIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTrackingRef = useRef(false);
  const lastUpdateRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);

  useEffect(() => {
    let mounted = true;
    const UPDATE_INTERVAL = 2000; // 2 segundos para web

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

    const stopTracking = async () => {
      if (!isTrackingRef.current) return;

      console.log('[GlobalTracking] 🛑 Deteniendo tracking...');

      // Limpiar polling web
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      // Limpiar watcher nativo de background-geolocation
      if (watcherIdRef.current && Capacitor.isNativePlatform()) {
        try {
          await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
          console.log('[GlobalTracking] Watcher nativo removido');
        } catch (e) {
          console.error('[GlobalTracking] Error removiendo watcher:', e);
        }
      }

      watcherIdRef.current = null;
      isTrackingRef.current = false;
      setIsActive(false);
    };

    const startNativeTracking = async (userId: string) => {
      try {
        console.log('[GlobalTracking] 🚀 Iniciando tracking nativo con foreground service...');

        // Mostrar guía si no está configurado el permiso "todo el tiempo"
        if (!isPermissionConfigured()) {
          setTimeout(() => {
            if (mounted) {
              console.log('[GlobalTracking] Mostrando guía de permisos');
              setShowPermissionGuide(true);
            }
          }, 1500);
        }

        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            // Estas opciones activan el foreground service
            backgroundMessage: "Compartiendo tu ubicación con clientes",
            backgroundTitle: "TodoCerca - Proveedor Activo",
            requestPermissions: true,
            stale: false,
            distanceFilter: 15, // Actualizar cada 15 metros
          },
          async (location, error) => {
            if (error) {
              console.error('[GlobalTracking] ❌ Error en ubicación:', error);
              
              if (error.code === "NOT_AUTHORIZED") {
                console.log('[GlobalTracking] Permisos no autorizados, mostrando guía...');
                resetPermissionConfigured();
                if (mounted) {
                  setShowPermissionGuide(true);
                }
              }
              return;
            }

            if (location && mounted && isTrackingRef.current) {
              console.log('[GlobalTracking] 📍 Ubicación nativa:', {
                lat: location.latitude.toFixed(6),
                lng: location.longitude.toFixed(6),
                time: new Date(location.time).toLocaleTimeString()
              });
              
              updateLocation(location.latitude, location.longitude);
            }
          }
        );

        watcherIdRef.current = watcherId;
        console.log('[GlobalTracking] ✅ Watcher nativo iniciado con ID:', watcherId);
        
      } catch (error) {
        console.error('[GlobalTracking] ❌ Error iniciando tracking nativo:', error);
      }
    };

    const startWebTracking = () => {
      console.log('[GlobalTracking] 🚀 Iniciando tracking web con polling...');
      
      // Polling activo para web
      const pollLocation = () => {
        if (!mounted || !isTrackingRef.current) return;
        
        if ('geolocation' in navigator) {
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

      // Obtener posición inicial
      pollLocation();

      // Polling cada 2 segundos
      pollIntervalRef.current = setInterval(pollLocation, UPDATE_INTERVAL);
      console.log('[GlobalTracking] ✅ Polling web iniciado');
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

        console.log('[GlobalTracking] 🚀 Iniciando tracking para proveedor:', profile.estado);
        isTrackingRef.current = true;
        setIsActive(true);

        // En app nativa usar background-geolocation con foreground service
        if (Capacitor.isNativePlatform()) {
          await startNativeTracking(user.id);
        } else {
          // En web usar polling
          startWebTracking();
        }
      } catch (err) {
        console.error('[GlobalTracking] Exception en startTracking:', err);
        isTrackingRef.current = false;
        setIsActive(false);
      }
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

  const closePermissionGuide = () => {
    setShowPermissionGuide(false);
  };

  return { isActive, showPermissionGuide, closePermissionGuide };
};
