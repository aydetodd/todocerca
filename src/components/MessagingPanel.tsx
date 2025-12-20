import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Send } from 'lucide-react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { ScrollArea } from './ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { trackMessaging } from '@/lib/analytics';

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
      className="fixed inset-0 bg-background z-[9999] flex flex-col h-[100dvh] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-primary text-white">
        <h3 className="font-bold">
          {receiverName ? `Chat con ${receiverName}` : 'Mensajes'}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-primary/90"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 pb-24" ref={scrollRef}>
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

            return (
              <div
                key={msg.id}
                className={`mb-4 ${isOwn ? 'text-right' : 'text-left'}`}
              >
                {!isOwn && (
                  <p className="text-xs text-muted-foreground mb-1">
                    {msg.sender?.apodo || 'Usuario'}
                  </p>
                )}
                <div
                  className={`
                  inline-block p-3 rounded-lg max-w-[80%]
                  ${isOwn ? 'bg-primary text-white' : 'bg-muted'}
                `}
                >
                  <span className="text-sm">{msg.message}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </p>
              </div>
            );
          })
        )}
      </ScrollArea>

      {/* Input */}
      <div
        className="p-4 pb-16 border-t"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1"
          />
          <Button onClick={handleSend} size="icon" className="bg-primary hover:bg-primary/90 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};