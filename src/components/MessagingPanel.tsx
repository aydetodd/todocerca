import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Send, ShieldCheck } from 'lucide-react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { ScrollArea } from './ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { trackMessaging } from '@/lib/analytics';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

interface MessagingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId?: string;
  receiverName?: string;
}

export const MessagingPanel = ({ isOpen, onClose, receiverId, receiverName }: MessagingPanelProps) => {
  const [message, setMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { messages, loading, sendMessage } = useRealtimeMessages(receiverId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      trackMessaging('opened');
    }
  }, [isOpen]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Mark messages as read when panel opens and we have a receiverId
  useEffect(() => {
    const markMessagesAsRead = async () => {
      if (!isOpen || !receiverId) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update all unread messages from this sender to read
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', receiverId)
        .eq('is_read', false);
    };

    markMessagesAsRead();
  }, [isOpen, receiverId]);

  useEffect(() => {
    // Auto-scroll al final cuando hay nuevos mensajes
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    }, 100);
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim()) return;
    
    trackMessaging('sent');
    
    await sendMessage(message, receiverId);
    setMessage('');
  };


  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-background z-[9999] flex flex-col overflow-x-hidden items-center"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Header */}
      <div className={`w-full max-w-[640px] flex items-center justify-between p-4 border-b shrink-0 ${
        receiverId === SYSTEM_USER_ID 
          ? 'bg-green-600 text-white' 
          : 'bg-primary text-primary-foreground'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {receiverId === SYSTEM_USER_ID && (
            <ShieldCheck className="h-5 w-5 shrink-0" />
          )}
          <h3 className="font-bold truncate">
            {receiverId === SYSTEM_USER_ID 
              ? 'TodoCerca — Canal Oficial' 
              : receiverName ? `Chat con ${receiverName}` : 'Mensajes'}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className={`shrink-0 ${
            receiverId === SYSTEM_USER_ID 
              ? 'text-white hover:bg-green-700' 
              : 'text-primary-foreground hover:bg-primary/90'
          }`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="w-full max-w-[640px] flex-1 px-4 py-4" ref={scrollRef}>
        <div className="pb-4">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center mt-8">
              Cargando mensajes…
            </p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-8">
              No hay mensajes aún.
            </p>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              const isSystemMsg = msg.sender_id === SYSTEM_USER_ID;

              return (
                <div
                  key={msg.id}
                  className={`mb-4 ${isOwn ? 'text-right' : 'text-left'}`}
                >
                  {!isOwn && (
                    <p className={`text-xs mb-1 flex items-center gap-1 ${
                      isSystemMsg ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'
                    }`}>
                      {isSystemMsg && <ShieldCheck className="h-3 w-3" />}
                      {isSystemMsg ? 'TodoCerca' : (msg.sender?.apodo || 'Usuario')}
                    </p>
                  )}
                  <div
                    className={`
                    inline-block p-3 rounded-lg max-w-[85%]
                    ${isOwn 
                      ? 'bg-primary text-primary-foreground' 
                      : isSystemMsg 
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                        : 'bg-muted'
                    }
                  `}
                  >
                    <span className="text-sm break-words whitespace-pre-wrap">
                      {msg.message.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                        /^https?:\/\//.test(part) ? (
                          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline font-semibold break-all">{part}</a>
                        ) : part
                      )}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${
                    isOwn 
                      ? (msg.is_read ? 'text-green-500' : 'text-red-500')
                      : 'text-muted-foreground'
                  }`}>
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div
        className="w-full max-w-[640px] p-4 border-t shrink-0 bg-background"
        style={{
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 1rem))',
        }}
      >
        <div className="flex gap-3 items-center">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 min-w-0"
          />
          <Button onClick={handleSend} size="icon" className="bg-primary hover:bg-primary/90 shrink-0 w-10 h-10">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
