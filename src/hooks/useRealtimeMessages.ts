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

    // Subscribe to new messages
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

          // Handle panic alerts
          if (newMessage.is_panic) {
            // Play siren sound for panic
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Audio play failed:', e));
            
            setTimeout(() => {
              audio.pause();
              audio.currentTime = 0;
            }, 10000);

            toast({
              title: "¡ALERTA DE PÁNICO!",
              description: newMessage.message,
              variant: "destructive",
            });
          } else if (isFromOther) {
            // Sonido ding-dong fuerte para mensajes recibidos
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

  return { messages, loading, sendMessage };
};