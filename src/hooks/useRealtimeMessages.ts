import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { playMessageSound, playHailSound, playTaxiAlertSound, startSOSAlertLoop, stopAlertLoop } from '@/lib/sounds';

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  is_panic: boolean;
  is_read: boolean;
  created_at: string;
  sender?: {
    apodo: string | null;
  };
}

export const useRealtimeMessages = (receiverId?: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessages([]);
        setLoading(false);
        return;
      }

      console.log('[useRealtimeMessages] Fetching messages', { receiverId });

      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (receiverId) {
        query = query.or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id}),is_panic.eq.true`
        );
      }

      const { data: messagesData, error } = await query;

      if (error) {
        console.error('Error fetching messages:', error);
        toast({
          title: 'Error',
          description: error.message || 'No se pudieron cargar los mensajes',
          variant: 'destructive',
        });
        setMessages([]);
        setLoading(false);
        return;
      }

      // Fetch sender profiles
      const senderIds = [...new Set(messagesData?.map(m => m.sender_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, apodo')
        .in('user_id', senderIds);

      // Merge data
      const merged =
        messagesData?.map(msg => ({
          ...msg,
          sender: profilesData?.find(p => p.user_id === msg.sender_id) || null,
        })) || [];

      setMessages(merged as Message[]);
      setLoading(false);
    };

    fetchMessages();

    // Subscribe to new messages and updates (for read receipts)
    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload: any) => {
          const newMessage = payload.new as Message;
          
          // Fetch sender info
          const { data: senderData } = await supabase
            .from('profiles')
            .select('apodo')
            .eq('user_id', newMessage.sender_id)
            .single();

          const messageWithSender = {
            ...newMessage,
            sender: senderData
          };

          setMessages(prev => [...prev, messageWithSender]);

          // Check if we're the receiver
          const { data: { user } } = await supabase.auth.getUser();
          const isFromOther = newMessage.sender_id !== user?.id;

          // Detect hail/parada messages - these alert the RECEIVER (driver)
          const isHailMessage = newMessage.message?.includes('¡PARADA DE TAXI!');
          
          console.log('🔔 [RealtimeMsg] New message:', {
            isHailMessage,
            isFromOther,
            isPanic: newMessage.is_panic,
            receiverId: newMessage.receiver_id,
            currentUserId: user?.id,
            messagePreview: newMessage.message?.substring(0, 50)
          });

          // Handle panic alerts - SOLO para receptores, NO para quien envía
          if (newMessage.is_panic && isFromOther) {
            // Usar sistema de voz TTS unificado con loop (sin sirena de sismo)
            startSOSAlertLoop();

            toast({
              title: "🆘 ¡ALERTA DE EMERGENCIA!",
              description: newMessage.message,
              variant: "destructive",
            });

            // Notificación del sistema para emergencia
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🆘 ¡ALERTA DE EMERGENCIA!', {
                body: newMessage.message,
                icon: '/icon-192.png',
                tag: 'sos-emergency',
                requireInteraction: true
              });
            }
          } else if (newMessage.is_panic && !isFromOther) {
            // Para quien envía, solo mostrar confirmación sin sonido (seguridad)
            toast({
              title: "✓ Alerta enviada",
              description: `Tu alerta SOS fue enviada a tus contactos`,
            });
          } else if (isHailMessage) {
            // Parada virtual - alerta especial para el conductor receptor
            // Se reproduce siempre que el mensaje sea para este usuario (incluso en pruebas con la misma cuenta)
            const isForMe = newMessage.receiver_id === user?.id;
            console.log('🖐️ [RealtimeMsg] HAIL detected!', { isForMe, receiverId: newMessage.receiver_id, userId: user?.id });
            
            if (isForMe) {
              console.log('🔊 [RealtimeMsg] Playing hail sound NOW');
              // Reproducir sonido inmediatamente con volumen máximo
              playHailSound();

              toast({
                title: "🖐️ ¡Parada virtual!",
                description: "Un usuario te está haciendo la parada. Detente para atender la solicitud.",
                variant: "destructive",
              });

              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🖐️ ¡PARADA VIRTUAL!', {
                  body: 'Un usuario te está haciendo la parada. Detente para atender la solicitud.',
                  icon: '/icon-192.png',
                  tag: 'taxi-hail',
                  requireInteraction: true
                });
              }
            }
          } else if (isFromOther) {
            // Sonido con voz TTS para mensajes recibidos normales
            playMessageSound();
            
            // Notificación del sistema (funciona en segundo plano si el tab está abierto)
            if ('Notification' in window && Notification.permission === 'granted') {
              // Intentar usar el Service Worker para mejor soporte en segundo plano
              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  title: `Mensaje de ${messageWithSender.sender?.apodo || 'Usuario'}`,
                  body: newMessage.message,
                  tag: 'new-message'
                });
              } else {
                // Fallback a notificación directa
                new Notification(`Mensaje de ${messageWithSender.sender?.apodo || 'Usuario'}`, {
                  body: newMessage.message,
                  icon: '/icon-192.png',
                  tag: 'message-notification',
                  requireInteraction: true
                });
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload: any) => {
          const updatedMessage = payload.new as Message;
          // Update is_read status in real-time
          setMessages(prev => 
            prev.map(msg => 
              msg.id === updatedMessage.id 
                ? { ...msg, is_read: updatedMessage.is_read }
                : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [receiverId, toast]);

  const sendMessage = async (message: string, receiverId?: string, isPanic: boolean = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId || null,
        message,
        is_panic: isPanic
      });

    if (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    }
  };

  // Función para detener la alarma manualmente
  const stopAlarm = () => {
    stopAlertLoop();
  };

  return { messages, loading, sendMessage, stopAlarm };
};
