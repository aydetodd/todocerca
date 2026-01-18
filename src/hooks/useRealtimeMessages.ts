import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

          // Handle panic alerts - SOLO para receptores, NO para quien envía
          if (newMessage.is_panic && isFromOther) {
            // Sirena de emergencia fuerte y larga (alarma de incendio/sismo)
            const playEmergencyAlarm = () => {
              // Usar sirena de emergencia fuerte - sonido de alarma
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2462/2462-preview.mp3');
              audio.volume = 1.0; // Volumen máximo
              audio.loop = true; // Repetir continuamente
              
              audio.play().catch(e => console.log('Audio play failed:', e));
              
              // Guardar referencia para poder detenerla
              (window as any).__sosAlarmAudio = audio;
              
              // Detener después de 30 segundos si no se detiene manualmente
              setTimeout(() => {
                if ((window as any).__sosAlarmAudio) {
                  (window as any).__sosAlarmAudio.pause();
                  (window as any).__sosAlarmAudio.currentTime = 0;
                  (window as any).__sosAlarmAudio.loop = false;
                  (window as any).__sosAlarmAudio = null;
                }
              }, 30000);
            };

            playEmergencyAlarm();
            
            // Vibrar el dispositivo si está disponible (patrón SOS)
            if ('vibrate' in navigator) {
              // Patrón de vibración SOS: ... --- ...
              navigator.vibrate([300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300]);
            }

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
          } else if (isFromOther) {
            // Sonido ding-dong fuerte para mensajes recibidos normales
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/111/111-preview.mp3');
            audio.volume = 1.0;
            audio.play().catch(e => console.log('Audio play failed:', e));
            
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
    if ((window as any).__sosAlarmAudio) {
      (window as any).__sosAlarmAudio.pause();
      (window as any).__sosAlarmAudio.currentTime = 0;
      (window as any).__sosAlarmAudio.loop = false;
      (window as any).__sosAlarmAudio = null;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0); // Detener vibración
    }
  };

  return { messages, loading, sendMessage, stopAlarm };
};
