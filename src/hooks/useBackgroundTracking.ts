import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { registerPlugin } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { supabase } from '@/integrations/supabase/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export const useBackgroundTracking = (isTrackingEnabled: boolean, groupId: string | null) => {
  
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isTrackingEnabled || !groupId) {
      return;
    }

    let watcherId: string | null = null;

    const startBackgroundTracking = async () => {
      try {
        // 1. Crear canal de notificación
        await ForegroundService.createNotificationChannel({
          id: 'tracking_location',
          name: 'Seguimiento de Ubicación',
          description: 'Mantiene activo el seguimiento de ubicación',
          importance: 3, // Default importance
        });

        // 2. Iniciar servicio en foreground
        await ForegroundService.startForegroundService({
          id: 1,
          title: 'TodoCerca - Ubicación Activa',
          body: 'Compartiendo tu ubicación con el grupo',
          smallIcon: 'ic_launcher',
          silent: true,
          notificationChannelId: 'tracking_location',
        });

        console.log('[BackgroundTracking] Foreground service started');

        // 3. Obtener user ID actual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuario no autenticado');
        }

        // 4. Configurar background geolocation
        const watcher = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Compartiendo ubicación",
            backgroundTitle: "TodoCerca - Rastreando",
            requestPermissions: true,
            stale: false,
            distanceFilter: 50, // Actualizar cada 50 metros
          },
          async (location, error) => {
            if (error) {
              console.error('[BackgroundTracking] Error en ubicación:', error);
              return;
            }

            if (location) {
              console.log('[BackgroundTracking] Nueva ubicación:', location);
              
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
                }
              } catch (error) {
                console.error('[BackgroundTracking] Error en actualización DB:', error);
              }
            }
          }
        );

        watcherId = watcher;
        console.log('[BackgroundTracking] Background watcher started:', watcher);
        
      } catch (error) {
        console.error('[BackgroundTracking] Error iniciando tracking:', error);
      }
    };

    const stopBackgroundTracking = async () => {
      try {
        if (watcherId) {
          await BackgroundGeolocation.removeWatcher({ id: watcherId });
          console.log('[BackgroundTracking] Watcher removed');
        }
        
        await ForegroundService.stopForegroundService();
        console.log('[BackgroundTracking] Foreground service stopped');
      } catch (error) {
        console.error('[BackgroundTracking] Error deteniendo tracking:', error);
      }
    };

    startBackgroundTracking();

    return () => {
      stopBackgroundTracking();
    };
  }, [isTrackingEnabled, groupId]);

  return {
    // Se puede exportar funciones adicionales si se necesitan
  };
};
