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
import { ArrowLeft, MapPin, Users, Plus, Trash2, CreditCard, Navigation, UserPlus, X, Map as MapIcon } from 'lucide-react';
import TrackingMap from '@/components/TrackingMap';
import { StatusControl } from '@/components/StatusControl';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { trackGPSSubscription, trackConversion } from '@/lib/analytics';

const TrackingGPS = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { allGroups, selectedGroupId, setSelectedGroupId, group, members, invitations, loading, createGroup, sendInvitation, cancelInvitation, removeMember, acceptInvitation, checkPendingInvitations, refetch } = useTrackingGroup();
  const { locations, updateMyLocation } = useTrackingLocations(group?.id || null);
  const [myInvitations, setMyInvitations] = useState<any[]>([]);
  
  const [groupName, setGroupName] = useState('');
  const [showGroupNameDialog, setShowGroupNameDialog] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [isSharing, setIsSharing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('[TRACKING GPS] Current user ID:', user.id);
        console.log('[TRACKING GPS] Current user email:', user.email);
      }
    };
    getCurrentUser();
    
    // Verificar invitaciones pendientes para este usuario
    const checkInvites = async () => {
      console.log('[TRACKING GPS] ===== VERIFICANDO INVITACIONES =====');
      const invites = await checkPendingInvitations();
      console.log('[TRACKING GPS] Invitaciones encontradas:', invites?.length || 0);
      console.log('[TRACKING GPS] Detalle de invitaciones:', JSON.stringify(invites, null, 2));
      if (invites && invites.length > 0) {
        setMyInvitations(invites);
        console.log('[TRACKING GPS] ✅ Mostrando', invites.length, 'invitación(es)');
      } else {
        setMyInvitations([]);
        console.log('[TRACKING GPS] ❌ No hay invitaciones para mostrar');
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
            trackGPSSubscription('completed', 400);
            trackConversion('gps_subscription', 400);
            
            toast({
              title: '¡Pago confirmado!',
              description: 'Ahora elige un nombre para tu grupo de tracking'
            });
            
            // Mostrar diálogo para crear el grupo
            setShowGroupNameDialog(true);
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

  // Recargar invitaciones cuando cambia el grupo o se actualiza la data
  useEffect(() => {
    const checkInvites = async () => {
      console.log('[DEBUG] Rechecking invitations...');
      const invites = await checkPendingInvitations();
      console.log('[DEBUG] Found invitations after group change:', invites);
      if (invites && invites.length > 0) {
        setMyInvitations(invites);
      } else {
        setMyInvitations([]);
      }
    };
    checkInvites();
  }, [group, allGroups]); // Agregar allGroups como dependencia

  useEffect(() => {
    if (isSharing && group?.subscription_status === 'active') {
      let watchId: number | null = null;
      let lastUpdateTime = 0;
      const MIN_UPDATE_INTERVAL = 3000; // 3 segundos mínimo entre actualizaciones

      if (navigator.geolocation) {
        // watchPosition es más eficiente que setInterval + getCurrentPosition
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const now = Date.now();
            // Solo actualizar si han pasado al menos 3 segundos desde la última actualización
            if (now - lastUpdateTime >= MIN_UPDATE_INTERVAL) {
              console.log('[GPS] Actualización de ubicación:', {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed
              });
              updateMyLocation(position.coords.latitude, position.coords.longitude);
              lastUpdateTime = now;
            }
          },
          (error) => {
            console.error('[GPS] Error obteniendo ubicación:', error);
            toast({
              title: 'Error de GPS',
              description: 'No se pudo actualizar tu ubicación. Verifica los permisos.',
              variant: 'destructive'
            });
          },
          {
            enableHighAccuracy: true, // Máxima precisión (usa GPS real)
            timeout: 5000, // 5 segundos máximo de espera
            maximumAge: 0 // No usar ubicaciones en caché, siempre obtener nueva
          }
        );
      }

      return () => {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          console.log('[GPS] Tracking detenido');
        }
      };
    }
  }, [isSharing, group]);

  const handleCreateGroupAfterPayment = async () => {
    if (!groupName.trim()) {
      toast({
        title: 'Error',
        description: 'Debes ingresar un nombre para el grupo',
        variant: 'destructive'
      });
      return;
    }
    try {
      await createGroup(groupName);
      setShowGroupNameDialog(false);
      setGroupName('');
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const handleStartSubscription = async () => {
    try {
      trackGPSSubscription('started');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Error',
          description: 'Debes iniciar sesión',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Redirigiendo a pago...',
        description: 'Serás redirigido a la pasarela de pago'
      });

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
      trackGPSSubscription('cancelled');
      toast({
        title: 'Error',
        description: 'No se pudo iniciar el proceso de pago',
        variant: 'destructive'
      });
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

  // MOSTRAR INVITACIONES PENDIENTES INCLUSO SI NO HAY GRUPO
  const hasInvitations = myInvitations.length > 0;
  console.log('[TRACKING GPS] ¿Tiene invitaciones?', hasInvitations, myInvitations);

  // SI NO HAY GRUPO PERO SÍ HAY INVITACIONES, MOSTRAR SOLO LAS INVITACIONES
  if (!group && hasInvitations) {
    console.log('[TRACKING GPS] Mostrando pantalla de invitaciones sin grupo');
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

          {/* INVITACIONES PENDIENTES */}
          <Card className="border-primary shadow-lg">
            <CardHeader className="bg-primary/10">
              <CardTitle className="flex items-center gap-2 text-primary text-2xl">
                <UserPlus className="h-6 w-6" />
                ¡Tienes {myInvitations.length} Invitación(es) Pendiente(s)!
              </CardTitle>
              <CardDescription className="text-base">
                Te han invitado a unirte a {myInvitations.length === 1 ? 'un grupo' : 'grupos'} de tracking GPS
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {myInvitations.map((invite: any) => (
                  <div key={invite.id} className="border-2 border-primary/30 rounded-lg p-6 space-y-4 bg-primary/5">
                    <div>
                      <p className="font-bold text-2xl text-primary mb-2">
                        {invite.tracking_groups?.name || 'Grupo Familiar'}
                      </p>
                      <p className="text-base text-muted-foreground">
                        Tu apodo en el grupo: <span className="font-semibold text-foreground text-lg">{invite.nickname}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Expira: {new Date(invite.expires_at).toLocaleDateString('es-MX', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <Button 
                      onClick={async () => {
                        try {
                          console.log('[TRACKING GPS] Aceptando invitación:', invite.id);
                          await acceptInvitation(invite.id, invite.group_id, invite.nickname);
                          const invites = await checkPendingInvitations();
                          setMyInvitations(invites || []);
                          toast({
                            title: '¡Unido exitosamente!',
                            description: 'Ya eres parte del grupo'
                          });
                        } catch (error) {
                          console.error('[TRACKING GPS] Error aceptando invitación:', error);
                        }
                      }}
                      className="w-full"
                      size="lg"
                    >
                      <UserPlus className="mr-2 h-5 w-5" />
                      Aceptar y Unirme al Grupo
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!group && !hasInvitations) {
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

          {showGroupNameDialog ? (
            <Card>
              <CardHeader>
                <CardTitle>Elige un nombre para tu grupo</CardTitle>
                <CardDescription>
                  Este será el nombre que verán todos los miembros del grupo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="groupNameInput">Nombre del Grupo</Label>
                  <Input
                    id="groupNameInput"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ej: Familia García, Equipo de Trabajo, etc."
                    className="mt-1"
                    autoFocus
                  />
                </div>
                
                <Button onClick={handleCreateGroupAfterPayment} className="w-full" size="lg" disabled={!groupName.trim()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear Grupo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <MapPin className="h-8 w-8 text-primary" />
                  <CardTitle className="text-2xl">Tracking GPS Familiar</CardTitle>
                </div>
                <CardDescription>
                  Suscripción para rastrear hasta 5 dispositivos en tiempo real. 
                  Después del pago, elegirás el nombre de tu grupo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                
                <Button onClick={handleStartSubscription} className="w-full" size="lg">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Suscribirse ($400 MXN/año)
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Podrás ingresar códigos de descuento en la pasarela de pago
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const isOwner = currentUserId === group.owner_id;
  const isActive = group.subscription_status === 'active';
  const totalSlots = members.length + invitations.length;

  return (
    <>
      {/* Full Screen Map View */}
      {showFullScreenMap && isActive && locations.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="absolute top-4 left-4 z-[60]">
            <Button 
              variant="default" 
              size="lg"
              onClick={() => setShowFullScreenMap(false)}
              className="shadow-lg"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Volver
            </Button>
          </div>
          <div className="w-full h-full">
            <TrackingMap locations={locations} currentUserId={currentUserId} />
          </div>
        </div>
      )}

      {/* Normal View */}
      {!showFullScreenMap && (
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

            {/* INVITACIONES PENDIENTES - SIEMPRE PRIMERO */}
            {myInvitations.length > 0 && (
              <Card className="border-primary mb-6 shadow-lg animate-pulse-slow">
                <CardHeader className="bg-primary/10">
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <UserPlus className="h-6 w-6" />
                    ¡Tienes {myInvitations.length} Invitación(es) Pendiente(s)!
                  </CardTitle>
                  <CardDescription>
                    Te han invitado a unirte a {myInvitations.length === 1 ? 'un grupo' : 'grupos'} de tracking
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {myInvitations.map((invite: any) => (
                      <div key={invite.id} className="border-2 border-primary/20 rounded-lg p-4 space-y-3 bg-primary/5">
                        <div>
                          <p className="font-bold text-xl text-primary">{invite.tracking_groups?.name || 'Grupo Familiar'}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Tu apodo en el grupo: <span className="font-semibold text-foreground">{invite.nickname}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Expira: {new Date(invite.expires_at).toLocaleDateString('es-MX', { 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <Button 
                          onClick={async () => {
                            try {
                              await acceptInvitation(invite.id, invite.group_id, invite.nickname);
                              // Refrescar invitaciones
                              const invites = await checkPendingInvitations();
                              setMyInvitations(invites || []);
                            } catch (error) {
                              console.error('Error accepting invitation:', error);
                            }
                          }}
                          className="w-full"
                          size="lg"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Aceptar Invitación
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Selector de Grupos - Siempre visible si hay grupos */}
            {allGroups.length > 0 && (
          <Card className="mb-6 border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {allGroups.length > 1 ? `Cambiar de Grupo (${allGroups.length})` : 'Mi Grupo'}
                  </CardTitle>
                  <CardDescription>
                    {allGroups.length > 1 
                      ? 'Selecciona el grupo que deseas ver' 
                      : 'Grupo actual'}
                  </CardDescription>
                </div>
                {allGroups.length > 1 && (
                  <Badge variant="outline" className="bg-primary/10">
                    {allGroups.length} grupos disponibles
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid gap-3">
                {allGroups.map((g) => {
                  const isCurrentUserOwner = g.owner_id === currentUserId;
                  const isSelected = selectedGroupId === g.id;
                  
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold text-base flex items-center gap-2">
                            {g.name}
                            {isSelected && (
                              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                Actual
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={isCurrentUserOwner ? 'default' : 'secondary'} className="text-xs">
                              {isCurrentUserOwner ? '👑 Dueño' : '👤 Miembro'}
                            </Badge>
                            <Badge variant={g.subscription_status === 'active' ? 'default' : 'outline'} className="text-xs">
                              {g.subscription_status === 'active' ? '✓ Activa' : '✗ Inactiva'}
                            </Badge>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="text-primary">
                            <Navigation className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
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
                  <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg">
                    <StatusControl />
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      💡 <strong>Semáforo de estado:</strong> Verde = disponible y visible en mapa | Amarillo = ocupado pero visible | Rojo = fuera de servicio y NO visible en mapa
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

          {/* Ver Mapa en Pantalla Completa */}
          {isActive && locations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ubicaciones en Tiempo Real</CardTitle>
                <CardDescription>
                  {locations.length} miembro(s) compartiendo ubicación
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setShowFullScreenMap(true)}
                  className="w-full"
                  size="lg"
                >
                  <MapIcon className="h-5 w-5 mr-2" />
                  Ver Mapa en Pantalla Completa
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    )}
    </>
  );
};

export default TrackingGPS;