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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (receiverId) {
        query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id}),is_panic.eq.true`);
      }

      const { data: messagesData, error } = await query;

      if (error) {
        console.error('Error fetching messages:', error);
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
      const merged = messagesData?.map(msg => ({
        ...msg,
        sender: profilesData?.find(p => p.user_id === msg.sender_id) || null
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
          const isForMe = !newMessage.receiver_id || newMessage.receiver_id === user?.id;
          const isFromOther = newMessage.sender_id !== user?.id;
          
          // Debug toast para ver qué está pasando
          console.log('Mensaje:', {
            de: newMessage.sender_id?.slice(-4),
            para: newMessage.receiver_id?.slice(-4) || 'todos',
            yo: user?.id?.slice(-4),
            isForMe,
            isFromOther
          });

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
            // Sonido para CUALQUIER mensaje de otro usuario (no solo si isForMe)
            // Esto es temporal para debug - suena aunque no sea para mí
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/111/111-preview.mp3');
            audio.volume = 1.0;
            audio.play().catch(e => console.log('Audio play failed:', e));
            
            // Browser notification if permission granted
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Nuevo mensaje', {
                body: newMessage.message,
                icon: '/icon-192.png',
                tag: 'message-notification'
              });
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