import { useState } from 'react';
import { GlobalHeader } from '@/components/GlobalHeader';
import { NavigationBar } from '@/components/NavigationBar';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useContacts } from '@/hooks/useContacts';
import { MessagingPanel } from '@/components/MessagingPanel';
import ShareContactButton from '@/components/ShareContactButton';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageCircle, Clock, User, Users, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const MessagesInbox = () => {
  const { conversations, loading: loadingConversations, markAsRead } = useUnreadMessages();
  const { contacts, loading: loadingContacts } = useContacts();
  const [selectedChat, setSelectedChat] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleOpenChat = (senderId: string, senderName: string) => {
    // Mark messages as read when opening the chat
    markAsRead(senderId);
    setSelectedChat({ id: senderId, name: senderName });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <GlobalHeader title="Mensajes" />

      <div className="container mx-auto px-4 py-4">
        <Tabs defaultValue="chats" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="chats" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contactos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chats">
            {loadingConversations ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageCircle className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No tienes mensajes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Cuando alguien te escriba, aparecerá aquí
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-240px)]">
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <Card
                      key={conversation.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleOpenChat(
                        conversation.sender_id,
                        conversation.sender_apodo
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-semibold text-foreground truncate">
                                {conversation.sender_apodo}
                              </h3>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatTime(conversation.last_message_time)}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {conversation.last_message}
                            </p>
                          </div>
                          {conversation.unread_count > 0 && (
                            <div className="bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                              {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="contacts">
            <div className="mb-4">
              <ShareContactButton variant="default" size="default" />
            </div>

            {loadingContacts ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserPlus className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No tienes contactos
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    Comparte tu código QR o enlace para que tus amigos te agreguen
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <Card
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedChat({
                        id: contact.contact_user_id,
                        name: contact.nickname || contact.profile?.apodo || contact.profile?.nombre || 'Usuario'
                      })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center flex-shrink-0">
                            <User className="h-6 w-6 text-secondary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {contact.nickname || contact.profile?.apodo || contact.profile?.nombre || 'Usuario'}
                            </h3>
                            {contact.nickname && contact.profile?.apodo && contact.nickname !== contact.profile?.apodo && (
                              <p className="text-sm text-muted-foreground">
                                @{contact.profile?.apodo}
                              </p>
                            )}
                          </div>
                          <MessageCircle className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <MessagingPanel
        isOpen={!!selectedChat}
        onClose={() => setSelectedChat(null)}
        receiverId={selectedChat?.id}
        receiverName={selectedChat?.name}
      />

      <NavigationBar />
    </div>
  );
};

export default MessagesInbox;
