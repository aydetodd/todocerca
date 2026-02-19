import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, ArrowLeft, RefreshCw, User } from 'lucide-react';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

interface ConversationMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

interface UserConversation {
  userId: string;
  userName: string;
  lastMessage: string;
  lastDate: string;
  unreadCount: number;
}

export default function SystemInbox() {
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      // Get all messages where receiver is system user (replies from users)
      const { data: incomingMsgs, error } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_id', SYSTEM_USER_ID)
        .neq('sender_id', SYSTEM_USER_ID)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!incomingMsgs?.length) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Group by sender
      const userIds = [...new Set(incomingMsgs.map(m => m.sender_id))];

      // Get user names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, apodo, nombre, telefono')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const convos: UserConversation[] = userIds.map(uid => {
        const userMsgs = incomingMsgs.filter(m => m.sender_id === uid);
        const profile = profileMap.get(uid);
        const unread = userMsgs.filter(m => !m.is_read).length;

        return {
          userId: uid,
          userName: profile?.apodo || profile?.nombre || profile?.telefono || 'Usuario',
          lastMessage: userMsgs[0]?.message || '',
          lastDate: userMsgs[0]?.created_at || '',
          unreadCount: unread,
        };
      });

      // Sort: unread first, then by date
      convos.sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
        return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
      });

      setConversations(convos);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (userId: string, userName: string) => {
    setSelectedUser(userId);
    setSelectedUserName(userName);

    // Get all messages between system user and this user
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${SYSTEM_USER_ID},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${SYSTEM_USER_ID})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);

      // Mark incoming as read
      const unreadIds = data
        .filter(m => m.sender_id === userId && !m.is_read)
        .map(m => m.id);

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadIds);
      }
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedUser) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const { error } = await supabase.functions.invoke('reply-as-system', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { receiverId: selectedUser, message: replyText }
      });

      if (error) throw error;

      toast({ title: "Mensaje enviado como TodoCerca" });
      setReplyText('');
      // Refresh conversation
      openConversation(selectedUser, selectedUserName);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) return `hace ${Math.floor(diffMs / 60000)} min`;
    if (diffHrs < 24) return `hace ${Math.floor(diffHrs)}h`;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  if (selectedUser) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedUser(null); fetchConversations(); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-bold text-sm">{selectedUserName}</h3>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {messages.map(msg => {
            const isSystem = msg.sender_id === SYSTEM_USER_ID;
            return (
              <div key={msg.id} className={`flex ${isSystem ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-2 rounded-lg text-sm ${
                  isSystem
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100'
                    : 'bg-muted text-foreground'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                  <p className="text-[10px] opacity-60 mt-1">{formatDate(msg.created_at || '')}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <textarea
            className="flex-1 min-h-[60px] p-2 text-sm rounded-md border border-input bg-background resize-y"
            placeholder="Responder como TodoCerca..."
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <Button
            onClick={handleReply}
            disabled={sending || !replyText.trim()}
            size="icon"
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Bandeja TodoCerca</h3>
        <Button variant="ghost" size="icon" onClick={fetchConversations}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay respuestas de usuarios aún.</p>
      ) : (
        conversations.map(conv => (
          <Card
            key={conv.userId}
            className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => openConversation(conv.userId, conv.userName)}
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{conv.userName}</span>
                  {conv.unreadCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatDate(conv.lastDate)}</span>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
