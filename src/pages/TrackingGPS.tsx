import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrackingGroup } from '@/hooks/useTrackingGroup';
import { useTrackingLocations } from '@/hooks/useTrackingLocations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MapPin, Users, Plus, Trash2, CreditCard, Navigation, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TrackingGPS = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { group, members, invitations, loading, createGroup, sendInvitation, cancelInvitation, removeMember, refetch } = useTrackingGroup();
  const { locations, updateMyLocation } = useTrackingLocations(group?.id || null);
  
  const [groupName, setGroupName] = useState('Mi Grupo Familiar');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getCurrentUser();
  }, []);

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
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateMyLocation(position.coords.latitude, position.coords.longitude);
          setIsSharing(true);
        },
        (error) => {
          toast({
            title: 'Error',
            description: 'No se pudo obtener tu ubicación',
            variant: 'destructive'
          });
        }
      );
    } else {
      setIsSharing(false);
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
                <Button
                  onClick={toggleSharing}
                  variant={isSharing ? 'destructive' : 'default'}
                  className="w-full mb-4"
                >
                  <Navigation className="mr-2 h-4 w-4" />
                  {isSharing ? 'Detener Compartir Ubicación' : 'Compartir Mi Ubicación'}
                </Button>
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
            </CardHeader>
            <CardContent className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{member.nickname}</p>
                    {member.phone_number && (
                      <p className="text-sm text-muted-foreground">{member.phone_number}</p>
                    )}
                    {member.is_owner && (
                      <Badge variant="secondary" className="mt-1">Dueño</Badge>
                    )}
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
              ))}
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
                <CardTitle>Invitar Miembro</CardTitle>
                <CardDescription>
                  Se enviará una invitación por WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="memberName">Nombre</Label>
                  <Input
                    id="memberName"
                    placeholder="Nombre"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="memberPhone">Teléfono (WhatsApp)</Label>
                  <Input
                    id="memberPhone"
                    placeholder="10 dígitos"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                  />
                </div>
                <Button onClick={handleSendInvitation} className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Enviar Invitación
                </Button>
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
                    Ningún miembro está compartiendo su ubicación
                  </p>
                ) : (
                  <div className="space-y-3">
                    {locations.map((loc) => (
                      <div key={loc.id} className="p-3 bg-muted rounded-lg">
                        <p className="font-medium">{loc.member?.nickname || 'Miembro'}</p>
                        <p className="text-sm text-muted-foreground">
                          Lat: {loc.latitude.toFixed(6)}, Lng: {loc.longitude.toFixed(6)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Actualizado: {new Date(loc.updated_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
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