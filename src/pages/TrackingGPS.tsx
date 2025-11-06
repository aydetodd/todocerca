import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrackingGroup } from '@/hooks/useTrackingGroup';
import { useTrackingLocations } from '@/hooks/useTrackingLocations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PhoneInput } from '@/components/ui/phone-input';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MapPin, Users, Plus, Trash2, CreditCard, Navigation, UserPlus, X } from 'lucide-react';
import TrackingMap from '@/components/TrackingMap';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TrackingGPS = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { allGroups, selectedGroupId, setSelectedGroupId, group, members, invitations, loading, createGroup, sendInvitation, cancelInvitation, removeMember, acceptInvitation, checkPendingInvitations, refetch } = useTrackingGroup();
  const { locations, updateMyLocation } = useTrackingLocations(group?.id || null);
  const [myInvitations, setMyInvitations] = useState<any[]>([]);
  
  const [groupName, setGroupName] = useState('Mi Grupo Familiar');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getCurrentUser();
    
    // Verificar invitaciones pendientes para este usuario
    const checkInvites = async () => {
      const invites = await checkPendingInvitations();
      if (invites && invites.length > 0) {
        setMyInvitations(invites);
      }
    };
    checkInvites();
  }, []);

  // Verificar suscripción después del checkout exitoso
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      if (searchParams.get('success') === 'true' && !checkingSubscription) {
        setCheckingSubscription(true);
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          toast({
            title: 'Verificando suscripción...',
            description: 'Espera un momento mientras confirmamos tu pago'
          });

          const { data, error } = await supabase.functions.invoke('check-tracking-subscription', {
            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          });

          if (error) throw error;

          if (data?.subscribed) {
            toast({
              title: '¡Suscripción activada!',
              description: 'Ya puedes agregar miembros y usar el tracking GPS'
            });
            
            // Recargar datos del grupo
            await refetch();
          }
          
          // Limpiar parámetro de la URL
          searchParams.delete('success');
          setSearchParams(searchParams);
        } catch (error: any) {
          console.error('Error checking subscription:', error);
          toast({
            title: 'Error',
            description: 'Hubo un problema verificando tu suscripción. Recarga la página.',
            variant: 'destructive'
          });
        } finally {
          setCheckingSubscription(false);
        }
      }
    };

    checkSubscriptionStatus();
  }, [searchParams]);

  // Recargar invitaciones cuando cambia el grupo
  useEffect(() => {
    const checkInvites = async () => {
      const invites = await checkPendingInvitations();
      if (invites && invites.length > 0) {
        setMyInvitations(invites);
      } else {
        setMyInvitations([]);
      }
    };
    checkInvites();
  }, [group]);

  useEffect(() => {
    if (isSharing && group?.subscription_status === 'active') {
      const interval = setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              updateMyLocation(position.coords.latitude, position.coords.longitude);
            },
            (error) => console.error('Error getting location:', error)
          );
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isSharing, group]);

  const handleCreateGroup = async () => {
    try {
      await createGroup(groupName);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const handleSendInvitation = async () => {
    if (!newMemberName.trim() || !newMemberPhone.trim()) {
      toast({
        title: 'Error',
        description: 'Por favor ingresa nombre y teléfono',
        variant: 'destructive'
      });
      return;
    }

    try {
      await sendInvitation(newMemberName, newMemberPhone);
      setNewMemberName('');
      setNewMemberPhone('');
    } catch (error) {
      console.error('Error sending invitation:', error);
    }
  };

  const handleSubscribe = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Error',
          description: 'Debes iniciar sesión',
          variant: 'destructive'
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-tracking-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la sesión de pago',
        variant: 'destructive'
      });
    }
  };

  const toggleSharing = () => {
    if (!isSharing && navigator.geolocation) {
      console.log('[DEBUG] Activating location sharing...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[DEBUG] Got position:', position.coords);
          updateMyLocation(position.coords.latitude, position.coords.longitude);
          setIsSharing(true);
          toast({
            title: 'Ubicación compartida',
            description: 'Tu ubicación se está compartiendo con el grupo'
          });
        },
        (error) => {
          console.error('[DEBUG] Geolocation error:', error);
          toast({
            title: 'Error',
            description: 'No se pudo obtener tu ubicación. Verifica los permisos.',
            variant: 'destructive'
          });
        }
      );
    } else {
      console.log('[DEBUG] Deactivating location sharing');
      setIsSharing(false);
      toast({
        title: 'Ubicación pausada',
        description: 'Dejaste de compartir tu ubicación'
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Tracking GPS Familiar</CardTitle>
              </div>
              <CardDescription>
                Crea un grupo para rastrear hasta 5 dispositivos. 
                Suscripción anual de $400 MXN.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="groupName">Nombre del Grupo</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej: Familia García"
                  className="mt-1"
                />
              </div>
              
              <Button onClick={handleCreateGroup} className="w-full" size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Crear Grupo
              </Button>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold">¿Qué incluye?</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ Hasta 5 dispositivos</li>
                  <li>✓ Ubicación en tiempo real</li>
                  <li>✓ Privacidad total (solo tu grupo)</li>
                  <li>✓ Sin publicidad</li>
                  <li>✓ Suscripción anual: $400 MXN</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isOwner = currentUserId === group.owner_id;
  const isActive = group.subscription_status === 'active';
  const totalSlots = members.length + invitations.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>

        {/* Selector de Grupos */}
        {allGroups.length > 1 && (
          <Card className="mb-6 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Mis Grupos ({allGroups.length})
              </CardTitle>
              <CardDescription>
                Selecciona el grupo que deseas visualizar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {allGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedGroupId === g.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-base">{g.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {g.owner_id === currentUserId ? 'Dueño' : 'Miembro'}
                        </p>
                      </div>
                      <Badge variant={g.subscription_status === 'active' ? 'default' : 'secondary'}>
                        {g.subscription_status === 'active' ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invitaciones Pendientes para Aceptar */}
        {myInvitations.length > 0 && (
          <Card className="border-primary mb-6">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                ¡Tienes Invitaciones Pendientes!
              </CardTitle>
              <CardDescription>
                Has sido invitado a {myInvitations.length} grupo(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {myInvitations.map((invite: any) => (
                  <div key={invite.id} className="border rounded-lg p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-lg">{invite.tracking_groups?.name || 'Grupo Familiar'}</p>
                      <p className="text-sm text-muted-foreground">
                        Tu apodo en el grupo: <span className="font-medium">{invite.nickname}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expira: {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button 
                      onClick={async () => {
                        try {
                          await acceptInvitation(invite.id, invite.group_id, invite.nickname);
                          setMyInvitations([]);
                        } catch (error) {
                          console.error('Error accepting invitation:', error);
                        }
                      }}
                      className="w-full"
                    >
                      Aceptar Invitación
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
          {/* Estado del Grupo */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MapPin className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>{group.name}</CardTitle>
                    <CardDescription>
                      {totalSlots} de 5 dispositivos
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={isActive ? 'default' : 'destructive'}>
                  {isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!isActive && isOwner && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-destructive font-medium mb-3">
                    Tu suscripción no está activa. Actívala para usar el tracking.
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Podrás ingresar un código de descuento en la pasarela de pago
                  </p>
                  <Button onClick={handleSubscribe} className="w-full">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Activar Suscripción ($400 MXN/año)
                  </Button>
                </div>
              )}

              {isActive && (
                <div className="space-y-4">
                  {/* Semáforo de Estado */}
                  <div className="flex items-center justify-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="relative flex flex-col gap-2 bg-gray-900/98 rounded-2xl p-3 shadow-2xl border-2 border-gray-600">
                      <p className="text-white text-xs font-semibold text-center mb-1">Tu Estado</p>
                      {/* Verde - Disponible */}
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full transition-all duration-300 border-2 ${
                          isSharing ? 'bg-green-500 border-green-300 shadow-[0_0_25px_rgba(34,197,94,1)]' : 'bg-green-950/40 border-green-950/60'
                        }`} />
                        <div className="absolute -right-16 top-1/2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground">
                          Disponible
                        </div>
                      </div>
                      {/* Amarillo - Ocupado */}
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-yellow-950/40 border-2 border-yellow-950/60" />
                        <div className="absolute -right-16 top-1/2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground">
                          Ocupado
                        </div>
                      </div>
                      {/* Rojo - Fuera de servicio */}
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full transition-all duration-300 border-2 ${
                          !isSharing ? 'bg-red-500 border-red-300 shadow-[0_0_25px_rgba(239,68,68,1)]' : 'bg-red-950/40 border-red-950/60'
                        }`} />
                        <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground">
                          Fuera de servicio
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botón de compartir */}
                  <Button
                    onClick={toggleSharing}
                    variant={isSharing ? 'destructive' : 'default'}
                    className="w-full"
                  >
                    <Navigation className="mr-2 h-4 w-4" />
                    {isSharing ? 'Detener Compartir Ubicación' : 'Compartir Mi Ubicación'}
                  </Button>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      💡 <strong>Importante:</strong> Todos los miembros deben estar viendo este mismo grupo "{group.name}" para verse en el mapa.
                    </p>
                  </div>
                </div>
              )}

              {group.subscription_end && (
                <p className="text-xs text-muted-foreground text-center">
                  Válida hasta: {new Date(group.subscription_end).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Miembros del Grupo */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Miembros del Grupo</CardTitle>
              </div>
              <CardDescription>
                {locations.length} de {members.length} compartiendo ubicación
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {members.map((member) => {
                const isSharing = locations.some(loc => loc.user_id === member.user_id);
                return (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.nickname}</p>
                        {isSharing && (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span>
                            En línea
                          </span>
                        )}
                        {!isSharing && (
                          <span className="text-xs text-muted-foreground">
                            No compartiendo
                          </span>
                        )}
                      </div>
                      {member.phone_number && (
                        <p className="text-sm text-muted-foreground">{member.phone_number}</p>
                      )}
                      <div className="flex gap-2 mt-1">
                        {member.is_owner && (
                          <Badge variant="secondary">Dueño</Badge>
                        )}
                      </div>
                    </div>
                    {isOwner && !member.is_owner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
              
              {isActive && locations.length < members.length && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                    💡 Nota: Para aparecer en el mapa
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    Cada miembro debe abrir esta página en su dispositivo y activar "Compartir Mi Ubicación"
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invitaciones Pendientes */}
          {invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Invitaciones Pendientes</CardTitle>
                <CardDescription>
                  Esperando que acepten la invitación
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invitations.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{invite.nickname}</p>
                        <p className="text-sm text-muted-foreground">{invite.phone_number}</p>
                        <p className="text-xs text-muted-foreground">
                          Expira: {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitation(invite.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invitar Miembro */}
          {isOwner && totalSlots < 5 && isActive && (
            <Card>
              <CardHeader>
                <CardTitle>Agregar Miembros al Grupo</CardTitle>
                <CardDescription>
                  Puedes agregar hasta {5 - totalSlots} miembro(s) más. Se enviará una invitación por SMS.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-primary/10 p-3 rounded-lg mb-3">
                  <p className="text-sm font-medium">📱 Espacios disponibles: {5 - totalSlots} de 5</p>
                </div>
                <div>
                  <Label htmlFor="memberName">Nombre del familiar</Label>
                  <Input
                    id="memberName"
                    placeholder="Ej: María García"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                  />
                </div>
                <PhoneInput
                  label="Teléfono (con WhatsApp)"
                  value={newMemberPhone}
                  onChange={setNewMemberPhone}
                  placeholder="5512345678"
                  id="memberPhone"
                  required
                />
                <Button onClick={handleSendInvitation} className="w-full" size="lg">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Enviar Invitación por SMS
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Se enviará un SMS con instrucciones para unirse al grupo
                </p>
              </CardContent>
            </Card>
          )}

          {/* Ubicaciones en Tiempo Real */}
          {isActive && (
            <Card>
              <CardHeader>
                <CardTitle>Ubicaciones en Tiempo Real</CardTitle>
                <CardDescription>
                  {locations.length} miembro(s) compartiendo ubicación
                </CardDescription>
              </CardHeader>
              <CardContent>
                {locations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Ningún miembro está compartiendo su ubicación. Activa "Compartir Mi Ubicación" arriba.
                  </p>
                ) : (
                  <TrackingMap locations={locations} currentUserId={currentUserId} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrackingGPS;