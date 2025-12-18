import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { isPermissionConfigured, resetPermissionConfigured } from '@/components/LocationPermissionGuide';
import { BackgroundGeolocation } from '@/integrations/capacitor/backgroundGeolocation';

export const useBackgroundTracking = (isTrackingEnabled: boolean, groupId: string | null) => {
  const watcherIdRef = useRef<string | null>(null);
  const isRunningRef = useRef(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);

  // Mostrar guía de permisos cuando se activa el tracking en plataforma nativa
  useEffect(() => {
    if (isTrackingEnabled && Capacitor.isNativePlatform() && !isPermissionConfigured()) {
      // Pequeño delay para que la UI se estabilice primero
      const timer = setTimeout(() => {
        setShowPermissionGuide(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isTrackingEnabled]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      console.log('[BackgroundTracking] No es plataforma nativa, ignorando');
      return;
    }

    const stopBackgroundTracking = async () => {
      try {
        console.log('[BackgroundTracking] 🛑 Deteniendo tracking...');
        
        if (watcherIdRef.current) {
          await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
          console.log('[BackgroundTracking] Watcher removido');
          watcherIdRef.current = null;
        }
        
        isRunningRef.current = false;
      } catch (error) {
        console.error('[BackgroundTracking] Error deteniendo tracking:', error);
      }
    };

    if (!isTrackingEnabled || !groupId) {
      console.log('[BackgroundTracking] Tracking deshabilitado o sin grupo');
      if (isRunningRef.current) {
        stopBackgroundTracking();
      }
      return;
    }

    const startBackgroundTracking = async () => {
      if (isRunningRef.current) {
        console.log('[BackgroundTracking] Ya está corriendo, ignorando');
        return;
      }

      try {
        console.log('[BackgroundTracking] 🚀 Iniciando background geolocation...');

        // Obtener user ID actual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuario no autenticado');
        }

        console.log('[BackgroundTracking] Usuario:', user.id);

        // El plugin background-geolocation maneja su propio foreground service
        // cuando backgroundMessage está definido
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            // CRÍTICO: Estas opciones activan el foreground service del plugin
            backgroundMessage: "Compartiendo tu ubicación en tiempo real",
            backgroundTitle: "TodoCerca - GPS Activo",
            requestPermissions: true,
            stale: false,
            distanceFilter: 20, // Actualizar cada 20 metros
          },
          async (location, error) => {
            if (error) {
              console.error('[BackgroundTracking] ❌ Error en ubicación:', error);
              
              if (error.code === "NOT_AUTHORIZED") {
                console.log('[BackgroundTracking] Permisos no autorizados, reseteando y mostrando guía...');
                // Resetear el flag para que el usuario vea el aviso de nuevo
                resetPermissionConfigured();
                setShowPermissionGuide(true);
              }
              return;
            }

            if (location) {
              console.log('[BackgroundTracking] 📍 Nueva ubicación:', {
                lat: location.latitude.toFixed(6),
                lng: location.longitude.toFixed(6),
                accuracy: location.accuracy,
                time: new Date(location.time).toLocaleTimeString()
              });
              
              // Actualizar ubicación en tracking_member_locations
              try {
                const { error: updateError } = await supabase
                  .from('tracking_member_locations')
                  .upsert({
                    user_id: user.id,
                    group_id: groupId,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    updated_at: new Date().toISOString(),
                  });

                if (updateError) {
                  console.error('[BackgroundTracking] Error actualizando ubicación:', updateError);
                } else {
                  console.log('[BackgroundTracking] ✅ Ubicación actualizada en DB');
                }

                // Si es proveedor, actualizar también proveedor_locations
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('role')
                  .eq('user_id', user.id)
                  .single();

                if (profile?.role === 'proveedor') {
                  await supabase
                    .from('proveedor_locations')
                    .upsert({
                      user_id: user.id,
                      latitude: location.latitude,
                      longitude: location.longitude,
                      updated_at: new Date().toISOString(),
                    });
                  console.log('[BackgroundTracking] ✅ Proveedor location actualizada');
                }
              } catch (dbError) {
                console.error('[BackgroundTracking] Error en actualización DB:', dbError);
              }
            }
          }
        );

        watcherIdRef.current = watcherId;
        isRunningRef.current = true;
        console.log('[BackgroundTracking] ✅ Watcher iniciado con ID:', watcherId);
        
      } catch (error) {
        console.error('[BackgroundTracking] ❌ Error iniciando tracking:', error);
        isRunningRef.current = false;
      }
    };

    startBackgroundTracking();

    return () => {
      stopBackgroundTracking();
    };
  }, [isTrackingEnabled, groupId]);

  const closePermissionGuide = () => {
    setShowPermissionGuide(false);
  };

  return {
    isRunning: isRunningRef.current,
    showPermissionGuide,
    closePermissionGuide,
  };
};
