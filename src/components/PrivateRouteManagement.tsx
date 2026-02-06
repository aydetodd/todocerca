import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Bus, Loader2, Users, Link, Trash2, CreditCard, Route, MapPin } from 'lucide-react';
import PrivateRouteDrivers from './PrivateRouteDrivers';
import DailyAssignments from './DailyAssignments';

interface PrivateVehicle {
  id: string;
  nombre: string;
  descripcion: string;
  invite_token: string;
  is_available: boolean;
  created_at: string;
}

interface PrivateRouteManagementProps {
  proveedorId: string;
  businessName: string;
}

export default function PrivateRouteManagement({ proveedorId, businessName }: PrivateRouteManagementProps) {
  const [vehicles, setVehicles] = useState<PrivateVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    subscribed: boolean;
    quantity: number;
    subscription_end?: string;
  } | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [isRouteDialogOpen, setIsRouteDialogOpen] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [newVehicle, setNewVehicle] = useState({ nombre: '', descripcion: '' });
  const [activeTab, setActiveTab] = useState<'routes' | 'drivers'>('routes');
  const { toast } = useToast();

  useEffect(() => {
    checkSubscription();
    fetchVehicles();
  }, [proveedorId]);

  const checkSubscription = async () => {
    try {
      setCheckingSubscription(true);
      const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'status' }
      });

      if (error) throw error;

      if (data?.action === 'status') {
        setSubscriptionStatus({
          subscribed: data.subscribed,
          quantity: data.quantity,
          subscription_end: data.subscription_end,
        });
      } else {
        setSubscriptionStatus({ subscribed: false, quantity: 0 });
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      setSubscriptionStatus({ subscribed: false, quantity: 0 });
    } finally {
      setCheckingSubscription(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, descripcion, invite_token, is_available, created_at')
        .eq('proveedor_id', proveedorId)
        .eq('is_private', true)
        .eq('route_type', 'privada')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setVehicles((data || []) as PrivateVehicle[]);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      setAddingVehicle(true);
      const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'add' }
      });

      if (error) throw error;

      if (data?.action === 'checkout' && data?.url) {
        window.open(data.url, '_blank');
        toast({
          title: "Redirigiendo a pago",
          description: "Completa el pago para suscribirte a chofer privado",
        });
      } else if (data?.action === 'added') {
        toast({
          title: "¡Suscripción de chofer agregada!",
          description: data.message,
        });
        await checkSubscription();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'No se pudo procesar',
        variant: "destructive",
      });
    } finally {
      setAddingVehicle(false);
    }
  };

  const handleCreateRoute = async () => {
    if (!newVehicle.nombre.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la ruta es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: category } = await supabase
        .from('product_categories')
        .select('id')
        .eq('name', 'Rutas de Transporte')
        .single();

      if (!category) throw new Error('Categoría no encontrada');

      const { error } = await supabase
        .from('productos')
        .insert({
          nombre: newVehicle.nombre,
          descripcion: newVehicle.descripcion || `Ruta privada - ${businessName}`,
          precio: 0,
          stock: 1,
          unit: 'viaje',
          proveedor_id: proveedorId,
          category_id: category.id,
          route_type: 'privada',
          is_private: true,
          is_mobile: true,
          is_available: true,
          pais: 'MX',
        });

      if (error) throw error;

      toast({
        title: "¡Ruta registrada!",
        description: `"${newVehicle.nombre}" agregada. Puedes compartir el enlace con los pasajeros.`,
      });

      setIsRouteDialogOpen(false);
      setNewVehicle({ nombre: '', descripcion: '' });
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'No se pudo registrar la ruta',
        variant: "destructive",
      });
    }
  };

  const handleDeleteRoute = async () => {
    if (!deleteVehicleId) return;
    try {
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', deleteVehicleId);

      if (error) throw error;

      toast({ title: "Ruta eliminada" });
      setDeleteVehicleId(null);
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendWhatsAppInviteLink = (vehicle: PrivateVehicle) => {
    const link = `${window.location.origin}/mapa?type=ruta&token=${vehicle.invite_token}`;
    const mensaje = encodeURIComponent(
      `🚌 *${businessName}*\n\nSigue en tiempo real la ruta *"${vehicle.nombre}"*:\n\n${link}\n\n⚠️ Este enlace es personal e intransferible.\n\n📱 Descarga la app: https://todocerca.lovable.app`
    );
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');
    toast({ title: "Compartir por WhatsApp", description: "Envía el enlace personalizado al pasajero" });
  };

  if (loading || checkingSubscription) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando...</p>
        </CardContent>
      </Card>
    );
  }

  // If viewing drivers for a specific vehicle
  if (selectedVehicleId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedVehicleId(null)}>
          ← Volver
        </Button>
        <PrivateRouteDrivers
          proveedorId={proveedorId}
          productoId={selectedVehicleId}
          vehicleName={vehicles.find(v => v.id === selectedVehicleId)?.nombre || ''}
          businessName={businessName}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Daily assignments panel */}
      {vehicles.length > 0 && (
        <DailyAssignments proveedorId={proveedorId} />
      )}

      {/* Tab switcher */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'routes' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('routes')}
          className="flex-1"
        >
          <Route className="h-4 w-4 mr-1" />
          Rutas
        </Button>
        <Button
          variant={activeTab === 'drivers' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('drivers')}
          className="flex-1"
        >
          <Users className="h-4 w-4 mr-1" />
          Choferes ({subscriptionStatus?.quantity || 0})
        </Button>
      </div>

      {/* === ROUTES TAB === */}
      {activeTab === 'routes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              Rutas / Nomenclaturas
            </CardTitle>
            <CardDescription>
              Registra todas las rutas que cubres. Son ilimitadas y sin costo adicional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {vehicles.length > 0 && (
              <div className="space-y-2">
                {vehicles.map((vehicle) => (
                  <Card key={vehicle.id} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary shrink-0" />
                            <h4 className="font-semibold text-sm">{vehicle.nombre}</h4>
                          </div>
                          {vehicle.descripcion && (
                            <p className="text-xs text-muted-foreground mt-1 ml-6">
                              {vehicle.descripcion}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendWhatsAppInviteLink(vehicle)}
                            title="Enviar enlace de pasajero por WhatsApp"
                          >
                            <Link className="h-3 w-3 mr-1" />
                            Pasajeros
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteVehicleId(vehicle.id)}
                            title="Eliminar ruta"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Button onClick={() => setIsRouteDialogOpen(true)} className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Ruta
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === DRIVERS TAB === */}
      {activeTab === 'drivers' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Choferes - {businessName}
            </CardTitle>
            <CardDescription>
              Cada chofer requiere una suscripción de $400 MXN/año. Los choferes eligen su ruta al abrir la app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Subscription status */}
            {subscriptionStatus?.subscribed ? (
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg">
                <div>
                  <p className="text-sm font-medium">
                    Suscripciones activas: {subscriptionStatus.quantity} chofer(es)
                  </p>
                  {subscriptionStatus.subscription_end && (
                    <p className="text-xs text-muted-foreground">
                      Vence: {new Date(subscriptionStatus.subscription_end).toLocaleDateString('es-MX')}
                    </p>
                  )}
                </div>
                <Badge variant="default">Activa</Badge>
              </div>
            ) : (
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  Necesitas una suscripción para registrar choferes.
                  Cada chofer cuesta $400 MXN al año.
                </AlertDescription>
              </Alert>
            )}

            {/* Manage drivers button */}
            {subscriptionStatus?.subscribed && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  // Show drivers management — use the first vehicle as context
                  if (vehicles.length > 0) {
                    setSelectedVehicleId(vehicles[0].id);
                  } else {
                    toast({
                      title: "Primero registra una ruta",
                      description: "Necesitas al menos una ruta para gestionar choferes",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Gestionar Choferes
              </Button>
            )}

            {/* Add driver subscription button */}
            <Button
              onClick={handleSubscribe}
              disabled={addingVehicle}
              className="w-full"
            >
              {addingVehicle ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Añadir Chofer ($400 MXN/año)</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog for registering a new route */}
      <Dialog open={isRouteDialogOpen} onOpenChange={setIsRouteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Ruta</DialogTitle>
            <DialogDescription>
              Registra una nomenclatura o nombre de ruta. Las rutas son ilimitadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="routeName">Nombre / Nomenclatura *</Label>
              <Input
                id="routeName"
                value={newVehicle.nombre}
                onChange={(e) => setNewVehicle({ ...newVehicle, nombre: e.target.value })}
                placeholder="Ej: Ruta 2, Ruta Sur, Express Norte..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Define el nombre como quieras identificar esta ruta
              </p>
            </div>
            <div>
              <Label htmlFor="routeDesc">Recorrido / Descripción</Label>
              <Input
                id="routeDesc"
                value={newVehicle.descripcion}
                onChange={(e) => setNewVehicle({ ...newVehicle, descripcion: e.target.value })}
                placeholder="Ej: Colonia Centro - Zona Industrial"
              />
            </div>
            <Button onClick={handleCreateRoute} className="w-full">
              <Route className="h-4 w-4 mr-2" />
              Registrar Ruta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete route confirmation */}
      <AlertDialog open={!!deleteVehicleId} onOpenChange={() => setDeleteVehicleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ruta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la ruta y sus invitaciones de pasajeros. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoute}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
