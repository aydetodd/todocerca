import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrackingGroup } from '@/hooks/useTrackingGroup';
import { useTrackingLocations } from '@/hooks/useTrackingLocations';
import { useBackgroundTracking } from '@/hooks/useBackgroundTracking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PhoneInput } from '@/components/ui/phone-input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Users, Plus, Minus, Trash2, CreditCard, Navigation, UserPlus, X, Map as MapIcon, Link, Copy, Check, Radio } from 'lucide-react';
import TrackingMap from '@/components/TrackingMap';
import { StatusControl } from '@/components/StatusControl';
import { GpsTrackerManagement } from '@/components/GpsTrackerManagement';
import { GpsTrackerDetailCard } from '@/components/GpsTrackerDetailCard';
import { LocationPermissionGuide } from '@/components/LocationPermissionGuide';
import { useGpsTrackers } from '@/hooks/useGpsTrackers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { trackGPSSubscription, trackConversion } from '@/lib/analytics';

const TrackingGPS = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { allGroups, selectedGroupId, setSelectedGroupId, group, members, invitations, loading, createGroup, sendInvitation, cancelInvitation, removeMember, acceptInvitation, checkPendingInvitations, refetch } = useTrackingGroup();
  const { locations, updateMyLocation } = useTrackingLocations(group?.id || null);
  const { trackers } = useGpsTrackers(group?.id || null);
  const [myInvitations, setMyInvitations] = useState<any[]>([]);
  
  const [groupName, setGroupName] = useState('');
  const [showGroupNameDialog, setShowGroupNameDialog] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [isSharing, setIsSharing] = useState(false); // Ahora se controla por el estado del perfil
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [additionalDevices, setAdditionalDevices] = useState(1);
  const [showAddDevicesDialog, setShowAddDevicesDialog] = useState(false);
  const [userStatus, setUserStatus] = useState<'available' | 'busy' | 'offline' | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Hook para background tracking - se activa automáticamente cuando isSharing es true
  const { showPermissionGuide, closePermissionGuide } = useBackgroundTracking(isSharing, group?.id || null);

  // Verificar y sincronizar el estado del usuario automáticamente
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('[TRACKING GPS] Current user ID:', user.id);
        console.log('[TRACKING GPS] Current user email:', user.email);
        
        // Obtener estado actual del usuario (o usar 'available' por defecto para proveedores)
        const { data: profileData } = await supabase
          .from('profiles')
          .select('estado, role')
          .eq('user_id', user.id)
          .single();
        
        if (profileData) {
          // Si es proveedor y no tiene estado, usar 'available' por defecto
          const currentStatus = profileData.estado || (profileData.role === 'proveedor' ? 'available' : 'offline');
          console.log('[TRACKING GPS] Estado del usuario:', currentStatus);
          setUserStatus(currentStatus as 'available' | 'busy' | 'offline');
          
          // Auto-activar seguimiento si el estado NO es offline
          if (currentStatus !== 'offline') {
            setIsSharing(true);
            console.log('[TRACKING GPS] 🟢 Auto-activando seguimiento de ubicación');
          }
        }
      }
    };
    getCurrentUser();
    
    // Sincronizar dispositivos adicionales desde Stripe
    syncAdditionalDevices();
    
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
    
    // Suscribirse a cambios en el estado del usuario
    const setupStatusSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const channel = supabase
        .channel('user_status_tracking')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[TRACKING GPS] 🔔 Estado actualizado:', payload.new);
            if (payload.new && 'estado' in payload.new) {
              const newStatus = payload.new.estado as 'available' | 'busy' | 'offline';
              setUserStatus(newStatus);
              
              // Auto-activar/desactivar seguimiento según el estado
              if (newStatus !== 'offline') {
                setIsSharing(true);
                console.log('[TRACKING GPS] 🟢 Auto-activando seguimiento (estado:', newStatus, ')');
              } else {
                setIsSharing(false);
                console.log('[TRACKING GPS] 🔴 Desactivando seguimiento (estado: offline)');
              }
            }
          }
        )
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    };
    
    setupStatusSubscription();
  }, []);
  
  // Manejar reconexión automática cuando se recupera internet (sin notificaciones molestas)
  useEffect(() => {
    let hasShownOfflineToast = false;
    
    const handleOnline = () => {
      console.log('[TRACKING GPS] 🌐 Conexión a internet recuperada');
      if (userStatus !== 'offline') {
        console.log('[TRACKING GPS] 🔄 Reactivando seguimiento de ubicación');
        setIsSharing(true);
      }
      hasShownOfflineToast = false;
    };
    
    const handleOffline = () => {
      console.log('[TRACKING GPS] 📴 Conexión a internet perdida');
      // Solo mostrar el toast una vez por sesión de desconexión
      if (!hasShownOfflineToast) {
        hasShownOfflineToast = true;
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userStatus]);

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

          // Si viene de una compra de dispositivos, sincronizar
          if (searchParams.get('devices')) {
            await syncAdditionalDevices();
          } else {
            // Verificar suscripción normal
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
          }
          
          // Limpiar parámetro de la URL
          searchParams.delete('success');
          searchParams.delete('devices');
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

  // Seguimiento automático de ubicación basado en el estado del perfil
  useEffect(() => {
    // En app nativa el tracking lo maneja useBackgroundTracking (BackgroundGeolocation + foreground service).
    // Evitamos usar navigator.geolocation en Android/iOS porque solo da permiso "con la app en uso" y se corta al apagar pantalla.
    if (Capacitor.isNativePlatform()) {
      return;
    }

    if (isSharing && group?.subscription_status === 'active') {
      let watchId: number | null = null;
      let lastUpdateTime = 0;
      const MIN_UPDATE_INTERVAL = 3000; // 3 segundos mínimo entre actualizaciones

      console.log('[GPS] 🚀 Iniciando seguimiento automático de ubicación (web)');
      console.log('[GPS] Estado del usuario:', userStatus);
      console.log('[GPS] Suscripción activa:', group?.subscription_status === 'active');

      if (navigator.geolocation) {
        // watchPosition mantiene el seguimiento activo continuamente
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const now = Date.now();
            // Solo actualizar si han pasado al menos 3 segundos desde la última actualización
            if (now - lastUpdateTime >= MIN_UPDATE_INTERVAL) {
              console.log('[GPS] 📍 Actualización de ubicación:', {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed,
                timestamp: new Date().toLocaleTimeString()
              });
              updateMyLocation(position.coords.latitude, position.coords.longitude);
              lastUpdateTime = now;
            }
          },
          (error) => {
            console.error('[GPS] ❌ Error obteniendo ubicación:', error);
            // Solo mostrar toast si es un error crítico
            if (error.code === error.PERMISSION_DENIED) {
              toast({
                title: 'Permiso de ubicación denegado',
                description: 'Por favor, habilita el permiso de ubicación en la configuración de tu navegador.',
                variant: 'destructive'
              });
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      } else {
        console.error('[GPS] ❌ Geolocalización no disponible en este navegador');
        toast({
          title: 'GPS no disponible',
          description: 'Tu dispositivo no soporta geolocalización.',
          variant: 'destructive'
        });
      }

      return () => {
        if (watchId !== null) {
          console.log('[GPS] 🛑 Deteniendo seguimiento de ubicación');
          navigator.geolocation.clearWatch(watchId);
        }
      };
    } else {
      console.log('[GPS] ⏸️ Seguimiento pausado - isSharing:', isSharing, 'subscription:', group?.subscription_status);
    }
  }, [isSharing, group, updateMyLocation, userStatus]);

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
      // Pasar true porque el grupo se crea después de un pago exitoso
      await createGroup(groupName, true);
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

  const handleGenerateLink = async () => {
    if (!newMemberName.trim()) {
      toast({
        title: 'Error',
        description: 'Por favor ingresa un nombre para el invitado',
        variant: 'destructive'
      });
      return;
    }

    if (!group?.id || !currentUserId) return;

    setGeneratingLink(true);
    try {
      // Create invitation without phone (link-based)
      const { data, error } = await supabase
        .from('tracking_invitations')
        .insert({
          group_id: group.id,
          invited_by: currentUserId,
          nickname: newMemberName.trim(),
          phone_number: null,
          status: 'pending',
        })
        .select('invite_token')
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/join-group?token=${data.invite_token}`;
      setInviteLink(link);
      setNewMemberName('');
      
      toast({
        title: 'Link generado',
        description: 'Comparte el link por WhatsApp u otro medio',
      });
    } catch (error: any) {
      console.error('Error generating link:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar el link',
        variant: 'destructive'
      });
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast({ title: 'Link copiado' });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({ title: 'Error al copiar', variant: 'destructive' });
    }
  };

  const handleShareWhatsApp = () => {
    if (!inviteLink) return;
    const message = `¡Únete a mi grupo de rastreo familiar! Haz clic aquí: ${inviteLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
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

  const handleAddDevices = async () => {
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

      toast({
        title: 'Redirigiendo a pago...',
        description: `Agregando ${additionalDevices} dispositivo(s) adicional(es)`
      });

      const { data, error } = await supabase.functions.invoke('add-tracking-devices', {
        body: { quantity: additionalDevices },
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

  const syncAdditionalDevices = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('sync-tracking-devices', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Error syncing devices:', error);
        return;
      }

      if (data) {
        console.log('Devices synced:', data);
        if (data.additional_devices > 0) {
          toast({
            title: 'Dispositivos sincronizados',
            description: `Ahora tienes ${data.max_devices} dispositivos disponibles (5 base + ${data.additional_devices} adicionales)`,
          });
        }
        // Recargar grupos para obtener el max_devices actualizado
        refetch();
      }
    } catch (error) {
      console.error('Error syncing devices:', error);
    }
  };

  // Ya no es necesaria función manual, el seguimiento es automático basado en el estado
  const toggleSharing = () => {
    toast({
      title: 'Seguimiento Automático',
      description: 'El seguimiento se activa automáticamente cuando tu estado NO es offline (rojo). Cambia tu estado usando el semáforo de arriba.',
    });
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
          <div className="absolute top-4 left-4 z-[1001]">
            <Button 
              variant="default" 
              size="lg"
              onClick={() => setShowFullScreenMap(false)}
              className="shadow-2xl bg-primary hover:bg-primary/90"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Volver
            </Button>
          </div>
          {/* Status Control overlay on fullscreen map */}
          <div className="absolute top-4 right-4 z-[1001]">
            <StatusControl />
          </div>
          <div className="w-full h-full">
            <TrackingMap locations={locations} currentUserId={currentUserId} showNamesButton={true} gpsTrackers={trackers} />
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
                      {totalSlots} de {group.max_devices} dispositivos
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
                      💡 <strong>Seguimiento Automático:</strong> Tu ubicación se comparte automáticamente cuando tu semáforo está en verde (disponible) o amarillo (ocupado), incluso sin tener la app abierta si tienes datos o WiFi. Rojo (offline) = NO visible en mapa.
                    </p>
                  </div>
                </div>
              )}

              {group.subscription_end && (
                <p className="text-xs text-muted-foreground text-center mt-4">
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
                    Cada miembro debe tener su semáforo en verde (disponible) o amarillo (ocupado) y tener señal de datos o WiFi. El seguimiento es automático.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rastreadores GPS - Gestión */}
          <GpsTrackerManagement groupId={group.id} isOwner={isOwner} />

          {/* Tarjetas Expandibles de Rastreadores GPS */}
          <GpsTrackerCards groupId={group.id} isOwner={isOwner} />

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
          {isOwner && totalSlots < group.max_devices && isActive && (
            <Card>
              <CardHeader>
                <CardTitle>Agregar Miembros al Grupo</CardTitle>
                <CardDescription>
                  Puedes agregar hasta {group.max_devices - totalSlots} miembro(s) más
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-primary/10 p-3 rounded-lg flex items-center justify-between">
                  <p className="text-sm font-medium">📱 Espacios disponibles: {group.max_devices - totalSlots} de {group.max_devices}</p>
                  {isOwner && isActive && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAddDevicesDialog(true)}
                      className="h-auto py-1 px-3 border-primary text-primary hover:bg-primary hover:text-primary-foreground flex flex-col items-center gap-0"
                    >
                      <Plus className="h-3 w-3" />
                      <span className="text-xs font-semibold leading-tight">Comprar</span>
                      <span className="text-xs font-semibold leading-tight">más</span>
                    </Button>
                  )}
                </div>

                {/* Opción 1: Link Gratis */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Invitación por Link</span>
                  </div>
                  
                  <div>
                    <Label htmlFor="memberNameLink">Nombre del familiar</Label>
                    <Input
                      id="memberNameLink"
                      placeholder="Ej: María García"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                    />
                  </div>

                  <Button 
                    onClick={handleGenerateLink} 
                    className="w-full" 
                    variant="outline"
                    disabled={generatingLink || !newMemberName.trim()}
                  >
                    <Link className="mr-2 h-4 w-4" />
                    {generatingLink ? 'Generando...' : 'Generar Link de Invitación'}
                  </Button>

                  {inviteLink && (
                    <div className="bg-muted p-3 rounded-lg space-y-2">
                      <p className="text-sm font-medium">Link generado:</p>
                      <div className="flex gap-2">
                        <Input 
                          value={inviteLink} 
                          readOnly 
                          className="text-xs"
                        />
                        <Button size="icon" variant="outline" onClick={handleCopyLink}>
                          {linkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button 
                        onClick={handleShareWhatsApp} 
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        Compartir por WhatsApp
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Opción 2: SMS */}
                <div className="border rounded-lg p-4 space-y-3 opacity-75">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">Invitación por SMS</span>
                  </div>

                  <PhoneInput
                    label="Teléfono (con WhatsApp)"
                    value={newMemberPhone}
                    onChange={setNewMemberPhone}
                    placeholder="5512345678"
                    id="memberPhone"
                    required
                  />
                  <Button 
                    onClick={handleSendInvitation} 
                    className="w-full" 
                    variant="secondary"
                    disabled={!newMemberName.trim() || !newMemberPhone.trim()}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Enviar por SMS (costo)
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Se enviará un SMS automático con instrucciones
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mapa de Ubicaciones en Tiempo Real */}
          {isActive && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Ubicaciones en Tiempo Real</CardTitle>
                    <CardDescription>
                      {locations.length > 0 
                        ? `${locations.length} miembro(s) compartiendo ubicación`
                        : 'No hay miembros activos en este momento'
                      }
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowFullScreenMap(true)}
                    variant="outline"
                    size="sm"
                  >
                    <MapIcon className="h-4 w-4 mr-1" />
                    Pantalla Completa
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[300px] rounded-b-lg overflow-hidden">
                  <TrackingMap locations={locations} currentUserId={currentUserId} gpsTrackers={trackers} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    )}

    {/* Modal para agregar dispositivos adicionales */}
    <Dialog open={showAddDevicesDialog} onOpenChange={setShowAddDevicesDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar Dispositivos Adicionales</DialogTitle>
          <DialogDescription>
            $100 MXN/año por cada dispositivo adicional
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Cantidad de dispositivos</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAdditionalDevices(Math.max(1, additionalDevices - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center bg-muted rounded-lg p-3">
                <p className="text-3xl font-bold">{additionalDevices}</p>
                <p className="text-xs text-muted-foreground">dispositivo(s)</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAdditionalDevices(Math.min(50, additionalDevices + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-primary/10 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm">Dispositivos:</span>
              <span className="font-medium">{additionalDevices}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm">Precio unitario:</span>
              <span className="font-medium">$100 MXN</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold">Total:</span>
              <span className="text-2xl font-bold text-primary">
                ${additionalDevices * 100} MXN/año
              </span>
            </div>
          </div>

          <Button onClick={handleAddDevices} className="w-full" size="lg">
            <CreditCard className="mr-2 h-5 w-5" />
            Proceder al Pago
          </Button>
          
          <p className="text-xs text-muted-foreground text-center">
            Podrás agregar códigos de descuento en la pasarela de pago
          </p>
        </div>
      </DialogContent>
    </Dialog>

    {/* Guía de permisos de ubicación en background */}
    <LocationPermissionGuide 
      open={showPermissionGuide} 
      onClose={closePermissionGuide} 
    />

    </>
  );
};

// Componente para mostrar tarjetas expandibles de trackers GPS
const GpsTrackerCards = ({ groupId, isOwner }: { groupId: string; isOwner: boolean }) => {
  const { trackers, loading } = useGpsTrackers(groupId);

  if (loading || trackers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Radio className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Información de Dispositivos GPS</h3>
      </div>
      {trackers.map((tracker) => (
        <GpsTrackerDetailCard
          key={tracker.id}
          tracker={tracker}
          isOwner={isOwner}
        />
      ))}
    </div>
  );
};

export default TrackingGPS;