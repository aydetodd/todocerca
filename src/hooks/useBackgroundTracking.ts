import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { registerPlugin } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { supabase } from '@/integrations/supabase/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export const useBackgroundTracking = (isTrackingEnabled: boolean, groupId: string | null) => {
  const watcherIdRef = useRef<string | null>(null);
  const isRunningRef = useRef(false);

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
        
        await ForegroundService.stopForegroundService();
        console.log('[BackgroundTracking] Foreground service detenido');
        
        isRunningRef.current = false;
      } catch (error) {
        console.error('[BackgroundTracking] Error deteniendo tracking:', error);
      }
    };

    if (!isTrackingEnabled || !groupId) {
      console.log('[BackgroundTracking] Tracking deshabilitado o sin grupo');
      // Detener si estaba corriendo
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
        console.log('[BackgroundTracking] 🚀 Iniciando servicio de background...');

        // 1. Crear canal de notificación con máxima importancia
        await ForegroundService.createNotificationChannel({
          id: 'tracking_location',
          name: 'Seguimiento de Ubicación',
          description: 'Mantiene activo el seguimiento de ubicación en background',
          importance: 5, // MAX importance para que no se cierre
        });

        console.log('[BackgroundTracking] ✅ Canal de notificación creado');

        // 2. Iniciar servicio en foreground con tipo LOCATION
        await ForegroundService.startForegroundService({
          id: 1,
          title: 'TodoCerca - GPS Activo',
          body: 'Compartiendo tu ubicación con el grupo',
          smallIcon: 'ic_launcher',
          silent: false, // Mostrar notificación visible
          notificationChannelId: 'tracking_location',
        });

        console.log('[BackgroundTracking] ✅ Foreground service iniciado');

        // 3. Obtener user ID actual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuario no autenticado');
        }

        console.log('[BackgroundTracking] Usuario:', user.id);

        // 4. Configurar background geolocation
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "TodoCerca está rastreando tu ubicación",
            backgroundTitle: "GPS Activo",
            requestPermissions: true,
            stale: false,
            distanceFilter: 30, // Actualizar cada 30 metros para mayor frecuencia
          },
          async (location, error) => {
            if (error) {
              console.error('[BackgroundTracking] ❌ Error en ubicación:', error);
              
              // Si es error de permisos, abrir configuración
              if (error.code === "NOT_AUTHORIZED") {
                console.log('[BackgroundTracking] Permisos no autorizados, abriendo configuración...');
                BackgroundGeolocation.openSettings();
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

  return {
    isRunning: isRunningRef.current,
  };
};
