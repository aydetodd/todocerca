import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playOrderSound, playAppointmentSound, playTaxiAlertSound, playHailSound, playMessageSound, startTaxiAlertLoop, stopAlertLoop } from '@/lib/sounds';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook global para notificaciones de:
 * - Pedidos/Apartados nuevos
 * - Citas nuevas  
 * - Solicitudes de taxi
 * 
 * Suena en CUALQUIER página de la app, no solo en las páginas específicas
 */
export const useGlobalNotifications = () => {
  const { toast } = useToast();
  const isInitialized = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const proveedorIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    let ordersChannel: ReturnType<typeof supabase.channel> | null = null;
    let appointmentsChannel: ReturnType<typeof supabase.channel> | null = null;
    let taxiChannel: ReturnType<typeof supabase.channel> | null = null;
    let messagesChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔔 [GlobalNotifications] No hay usuario logueado');
        return;
      }

      userIdRef.current = user.id;
      console.log('🔔 [GlobalNotifications] Iniciando para usuario:', user.id);

      // Obtener proveedor_id si existe
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (proveedor) {
        proveedorIdRef.current = proveedor.id;
        console.log('🔔 [GlobalNotifications] Usuario es proveedor:', proveedor.id);

        // =====================
        // 🛒 PEDIDOS/APARTADOS
        // =====================
        ordersChannel = supabase
          .channel('global-orders-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'pedidos',
              filter: `proveedor_id=eq.${proveedor.id}`,
            },
            (payload) => {
              console.log('🛒 [GlobalNotifications] Nuevo pedido recibido:', payload);
              playOrderSound();
              toast({
                title: "🛒 ¡Nuevo Apartado!",
                description: `Pedido de ${payload.new.cliente_nombre}`,
                duration: 10000,
              });
            }
          )
          .subscribe((status) => {
            console.log('📡 [GlobalNotifications] Orders channel:', status);
          });

        // =====================
        // 📅 CITAS
        // =====================
        appointmentsChannel = supabase
          .channel('global-appointments-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'citas',
              filter: `proveedor_id=eq.${proveedor.id}`,
            },
            (payload) => {
              console.log('📅 [GlobalNotifications] Nueva cita recibida:', payload);
              playAppointmentSound();
              toast({
                title: "📅 ¡Nueva Cita!",
                description: `Cita de ${payload.new.cliente_nombre}`,
                duration: 10000,
              });
            }
          )
          .subscribe((status) => {
            console.log('📡 [GlobalNotifications] Appointments channel:', status);
          });
      }

      // =====================
      // 🚕 TAXI (para conductores)
      // =====================
      const { data: profile } = await supabase
        .from('profiles')
        .select('provider_type')
        .eq('user_id', user.id)
        .single();

      if (profile?.provider_type === 'taxi') {
        console.log('🚕 [GlobalNotifications] Usuario es conductor de taxi');
        
        taxiChannel = supabase
          .channel('global-taxi-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'taxi_requests',
              filter: `driver_id=eq.${user.id}`,
            },
            (payload) => {
              console.log('🚕 [GlobalNotifications] Nueva solicitud de taxi:', payload);
              startTaxiAlertLoop();
              toast({
                title: "🚕 ¡Solicitud de Viaje!",
                description: "Tienes una nueva solicitud de taxi",
                duration: 30000,
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'taxi_requests',
              filter: `driver_id=eq.${user.id}`,
            },
            (payload) => {
              if (payload.new.status !== 'pending') {
                console.log('🚕 [GlobalNotifications] Taxi request actualizado, deteniendo alarma');
                stopAlertLoop();
              }
            }
          )
          .subscribe((status) => {
            console.log('📡 [GlobalNotifications] Taxi channel:', status);
          });
      }

      // =====================
      // 🖐️ PARADA VIRTUAL (mensajes globales)
      // =====================
      messagesChannel = supabase
        .channel('global-hail-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${user.id}`,
          },
          (payload) => {
            const msg = payload.new as any;
            const isHailMessage = msg.message?.includes('¡PARADA DE TAXI!');
            const isPanic = msg.is_panic === true;
            const isFromSystem = msg.sender_id === '00000000-0000-0000-0000-000000000001';
            
            console.log('🔔 [GlobalNotifications] Mensaje recibido:', {
              isHail: isHailMessage,
              isPanic,
              isFromSystem,
              messagePreview: msg.message?.substring(0, 50)
            });

            if (isHailMessage) {
              console.log('🔊 [GlobalNotifications] ¡PARADA VIRTUAL detectada! Reproduciendo audio...');
              playHailSound();
              toast({
                title: "🖐️ ¡Parada virtual!",
                description: "Un usuario te está haciendo la parada. Detente para atender la solicitud.",
                variant: "destructive",
                duration: 15000,
              });

              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🖐️ ¡PARADA VIRTUAL!', {
                  body: 'Un usuario te está haciendo la parada. Detente para atender la solicitud.',
                  icon: '/icon-192.png',
                  tag: 'taxi-hail',
                  requireInteraction: true
                });
              }
            } else if (!isPanic && !isFromSystem) {
              // Mensaje normal de chat interno — alerta con voz TTS
              console.log('💬 [GlobalNotifications] Mensaje normal recibido, reproduciendo alerta con voz');
              playMessageSound();
              toast({
                title: "💬 Nuevo mensaje",
                description: "Tienes un nuevo mensaje en TodoCerca",
                duration: 8000,
              });

              if ('Notification' in window && Notification.permission === 'granted') {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: '💬 Nuevo mensaje en TodoCerca',
                    body: msg.message?.substring(0, 100) || 'Tienes un nuevo mensaje',
                    tag: 'new-message-global'
                  });
                } else {
                  new Notification('💬 Nuevo mensaje en TodoCerca', {
                    body: msg.message?.substring(0, 100) || 'Tienes un nuevo mensaje',
                    icon: '/icon-192.png',
                    tag: 'new-message-global',
                    requireInteraction: true
                  });
                }
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 [GlobalNotifications] Messages/Hail channel:', status);
        });
    };

    setupNotifications();

    return () => {
      console.log('🔔 [GlobalNotifications] Limpiando listeners...');
      if (ordersChannel) supabase.removeChannel(ordersChannel);
      if (appointmentsChannel) supabase.removeChannel(appointmentsChannel);
      if (taxiChannel) {
        supabase.removeChannel(taxiChannel);
        stopAlertLoop();
      }
      if (messagesChannel) supabase.removeChannel(messagesChannel);
    };
  }, [toast]);
};
