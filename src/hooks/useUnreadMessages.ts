import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Conversation {
  id: string;
  sender_id: string;
  sender_apodo: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

export const useUnreadMessages = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchConversations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    // Get all messages where I'm the receiver
    const { data: messagesData, error } = await supabase
      .from('messages')
      .select('*')
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching messages:', error);
      setLoading(false);
      return;
    }

    // Group by sender
    const conversationMap = new Map<string, {
      messages: typeof messagesData;
      lastMessage: typeof messagesData[0];
    }>();

    messagesData?.forEach(msg => {
      if (!conversationMap.has(msg.sender_id)) {
        conversationMap.set(msg.sender_id, {
          messages: [msg],
          lastMessage: msg
        });
      } else {
        conversationMap.get(msg.sender_id)!.messages.push(msg);
      }
    });

    // Fetch sender profiles
    const senderIds = Array.from(conversationMap.keys());
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, apodo')
      .in('user_id', senderIds);

    // Build conversations list
    const conversationsList: Conversation[] = [];
    let totalUnread = 0;

    conversationMap.forEach((data, senderId) => {
      const profile = profilesData?.find(p => p.user_id === senderId);
      const unreadCount = data.messages.length; // All received messages for now
      totalUnread += unreadCount;

      conversationsList.push({
        id: senderId,
        sender_id: senderId,
        sender_apodo: profile?.apodo || 'Usuario',
        last_message: data.lastMessage.message,
        last_message_time: data.lastMessage.created_at || '',
        unread_count: unreadCount
      });
    });

    // Sort by last message time
    conversationsList.sort((a, b) => 
      new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime()
    );

    setConversations(conversationsList);
    setUnreadCount(totalUnread);
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();

    // Subscribe to new messages
    const channel = supabase
      .channel('unread_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          // Refresh conversations when new message arrives
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { 
    unreadCount, 
    conversations, 
    loading, 
    currentUserId,
    refresh: fetchConversations 
  };
};
