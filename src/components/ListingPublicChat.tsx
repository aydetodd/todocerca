import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, X, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface Comment {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  is_read?: boolean;
  profile?: {
    apodo: string | null;
    nombre: string;
  };
}

interface ListingPublicChatProps {
  listingId: string;
  listingTitle: string;
  ownerName?: string;
  ownerId?: string;
}

export function ListingPublicChat({ listingId, listingTitle, ownerName, ownerId }: ListingPublicChatProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isOwner = currentUserId === ownerId;

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  // Fetch comments when expanded
  useEffect(() => {
    if (!isExpanded) return;

    const fetchComments = async () => {
      setLoading(true);
      try {
        const { data: commentsData, error } = await supabase
          .from('listing_comments')
          .select('*')
          .eq('listing_id', listingId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Fetch profiles for users
        const userIds = [...new Set(commentsData?.map(c => c.user_id) || [])];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, apodo, nombre')
          .in('user_id', userIds);

        const commentsWithProfiles = commentsData?.map(comment => ({
          ...comment,
          profile: profilesData?.find(p => p.user_id === comment.user_id)
        })) || [];

        setComments(commentsWithProfiles);
        setCommentCount(commentsWithProfiles.length);

        // If current user is the owner, mark all unread comments as read
        if (isOwner && commentsWithProfiles.length > 0) {
          const unreadIds = commentsWithProfiles
            .filter(c => !c.is_read && c.user_id !== currentUserId)
            .map(c => c.id);
          
          if (unreadIds.length > 0) {
            await supabase
              .from('listing_comments')
              .update({ is_read: true })
              .in('id', unreadIds);
          }
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();

    // Subscribe to new comments and updates
    const channel = supabase
      .channel(`listing_comments_${listingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listing_comments',
          filter: `listing_id=eq.${listingId}`
        },
        async (payload) => {
          const newComment = payload.new as Comment;
          
          // Fetch profile for the new comment
          const { data: profileData } = await supabase
            .from('profiles')
            .select('user_id, apodo, nombre')
            .eq('user_id', newComment.user_id)
            .single();

          const commentWithProfile = {
            ...newComment,
            profile: profileData
          };

          setComments(prev => [...prev, commentWithProfile]);
          setCommentCount(prev => prev + 1);

          // If owner is viewing, mark as read immediately
          if (isOwner && newComment.user_id !== currentUserId) {
            await supabase
              .from('listing_comments')
              .update({ is_read: true })
              .eq('id', newComment.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'listing_comments',
          filter: `listing_id=eq.${listingId}`
        },
        (payload) => {
          const updatedComment = payload.new as Comment;
          setComments(prev => 
            prev.map(c => c.id === updatedComment.id ? { ...c, is_read: updatedComment.is_read } : c)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [listingId, isExpanded, isOwner, currentUserId]);

  // Auto-scroll when new comments arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments, isExpanded]);

  // Fetch initial comment count
  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('listing_comments')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listingId);
      
      setCommentCount(count || 0);
    };
    fetchCount();
  }, [listingId]);

  const handleSend = async () => {
    if (!newMessage.trim() || !currentUserId) {
      if (!currentUserId) {
        toast.error('Debes iniciar sesión para comentar');
      }
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase
        .from('listing_comments')
        .insert({
          listing_id: listingId,
          user_id: currentUserId,
          message: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending comment:', error);
      toast.error('Error al enviar el comentario');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getDisplayName = (comment: Comment) => {
    return comment.profile?.apodo || comment.profile?.nombre || 'Usuario';
  };

  return (
    <div className="mt-3 border-t pt-3">
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Chat público ({commentCount} {commentCount === 1 ? 'mensaje' : 'mensajes'})
        </span>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {/* Expanded Chat Area */}
      {isExpanded && (
        <div className="mt-2 bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">
            Preguntas sobre: <span className="font-medium">{listingTitle}</span>
            {ownerName && <span> - de {ownerName}</span>}
          </p>

          {/* Messages Area */}
          <ScrollArea className="h-48 mb-2" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Cargando...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground text-center">
                  No hay preguntas aún.<br />¡Sé el primero en preguntar!
                </p>
              </div>
            ) : (
              <div className="space-y-2 pr-3">
                {comments.map((comment) => {
                  const isOwn = comment.user_id === currentUserId;
                  return (
                    <div
                      key={comment.id}
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          isOwn
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background border'
                        }`}
                      >
                        {!isOwn && (
                          <p className="text-xs font-medium mb-1 text-primary">
                            {getDisplayName(comment)}
                          </p>
                        )}
                        <p className="text-sm break-words">{comment.message}</p>
                      </div>
                      <span className={`text-[10px] mt-0.5 px-1 ${
                        isOwn 
                          ? (comment.is_read ? 'text-green-500' : 'text-red-500')
                          : 'text-muted-foreground'
                      }`}>
                        {formatDistanceToNow(new Date(comment.created_at), {
                          addSuffix: true,
                          locale: es
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              placeholder={currentUserId ? "Escribe una pregunta..." : "Inicia sesión para preguntar"}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!currentUserId || sending}
              className="flex-1 h-9 text-sm"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!currentUserId || !newMessage.trim() || sending}
              className="h-9 px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
