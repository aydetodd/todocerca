import { useState } from 'react';
import { GlobalHeader } from '@/components/GlobalHeader';

import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useContacts } from '@/hooks/useContacts';
import { MessagingPanel } from '@/components/MessagingPanel';
import ShareContactButton from '@/components/ShareContactButton';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import { MessageCircle, Clock, User, Users, UserPlus, ShieldCheck, Ban, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const MessagesInbox = () => {
  const { conversations, loading: loadingConversations, markAsRead } = useUnreadMessages();
  const { contacts, loading: loadingContacts, toggleBlocked, addContactByPhone } = useContacts();
  const [selectedChat, setSelectedChat] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const handleOpenChat = (senderId: string, senderName: string) => {
    // Mark messages as read when opening the chat
    markAsRead(senderId);
    setSelectedChat({ id: senderId, name: senderName });
  };

  const handleSearchByPhone = async () => {
    const clean = phoneSearch.replace(/\D/g, '');
    if (clean.length < 10) return;
    setSearching(true);
    const result = await addContactByPhone(phoneSearch);
    setSearching(false);
    if (result) {
      setPhoneSearch('');
      setSelectedChat({ id: result.userId, name: result.name });
    }
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
                  {conversations.map((conversation) => {
                    const isSystem = conversation.sender_id === SYSTEM_USER_ID;
                    return (
                      <Card
                        key={conversation.id}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${isSystem ? 'border-green-500/30 bg-green-50/5' : ''}`}
                        onClick={() => handleOpenChat(
                          conversation.sender_id,
                          isSystem ? 'TodoCerca' : conversation.sender_apodo
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isSystem ? 'bg-green-500/20' : 'bg-primary/10'
                            }`}>
                              {isSystem ? (
                                <ShieldCheck className="h-6 w-6 text-green-600" />
                              ) : (
                                <User className="h-6 w-6 text-primary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <h3 className={`font-semibold truncate ${isSystem ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                                    {isSystem ? 'TodoCerca' : conversation.sender_apodo}
                                  </h3>
                                  {isSystem && (
                                    <span className="text-[10px] bg-green-500/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                      Oficial
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-2">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(conversation.last_message_time)}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {conversation.last_message}
                              </p>
                            </div>
                            {conversation.unread_count > 0 && (
                              <div className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${
                                isSystem ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'
                              }`}>
                                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="contacts">
            <div className="mb-4 space-y-3">
              <ShareContactButton variant="default" size="default" />

              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5" />
                    Buscar por número de teléfono
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <PhoneInput
                        value={phoneSearch}
                        onChange={setPhoneSearch}
                        placeholder="Número de teléfono"
                      />
                    </div>
                    <Button
                      onClick={handleSearchByPhone}
                      disabled={searching || phoneSearch.replace(/\D/g, '').length < 10}
                      size="sm"
                    >
                      {searching ? '...' : 'Chatear'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Si el número está registrado en TodoCerca, se agrega el contacto y se abre el chat.
                  </p>
                </CardContent>
              </Card>
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
                    Comparte tu QR, tu enlace, o busca a alguien por su número de teléfono arriba.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-360px)]">
                <div className="space-y-2">
                  {contacts.map((contact) => {
                    const displayName = contact.nickname || contact.profile?.apodo || contact.profile?.nombre || 'Usuario';
                    return (
                      <Card
                        key={contact.id}
                        className={`transition-colors ${contact.blocked ? 'opacity-50' : 'hover:bg-muted/50'}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                              onClick={() => {
                                if (contact.blocked) return;
                                setSelectedChat({ id: contact.contact_user_id, name: displayName });
                              }}
                            >
                              <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center flex-shrink-0">
                                <User className="h-6 w-6 text-secondary-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground truncate">
                                  {displayName}
                                  {contact.blocked && (
                                    <span className="ml-2 text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full font-medium">
                                      Bloqueado
                                    </span>
                                  )}
                                </h3>
                                {contact.nickname && contact.profile?.apodo && contact.nickname !== contact.profile?.apodo && (
                                  <p className="text-sm text-muted-foreground">
                                    @{contact.profile?.apodo}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBlocked(contact.id, !contact.blocked);
                              }}
                              title={contact.blocked ? 'Desbloquear' : 'Bloquear'}
                            >
                              <Ban className={`h-4 w-4 ${contact.blocked ? 'text-destructive' : 'text-muted-foreground'}`} />
                            </Button>
                            {!contact.blocked && <MessageCircle className="h-5 w-5 text-muted-foreground" />}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
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

      
    </div>
  );
};

export default MessagesInbox;
