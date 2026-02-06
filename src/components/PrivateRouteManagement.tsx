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
import { Plus, Bus, Loader2, Users, Link, Trash2, CreditCard, AlertCircle } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [newVehicle, setNewVehicle] = useState({ nombre: '', descripcion: '' });
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
          description: "Completa el pago para suscribirte a rutas privadas",
        });
      } else if (data?.action === 'added') {
        toast({
          title: "¡Vehículo agregado!",
          description: data.message,
        });
        await checkSubscription();
        setIsDialogOpen(true); // Open dialog to register the new vehicle
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

  const handleCreateVehicle = async () => {
    if (!newVehicle.nombre.trim()) {
      toast({
        title: "Error",
        description: "El nombre del vehículo es obligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the rutas category id
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
        title: "¡Vehículo registrado!",
        description: `"${newVehicle.nombre}" agregado. Puedes compartir el enlace con los pasajeros.`,
      });

      setIsDialogOpen(false);
      setNewVehicle({ nombre: '', descripcion: '' });
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'No se pudo registrar el vehículo',
        variant: "destructive",
      });
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteVehicleId) return;
    try {
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', deleteVehicleId);

      if (error) throw error;

      toast({ title: "Vehículo eliminado" });
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
          <p className="text-muted-foreground">Cargando rutas privadas...</p>
        </CardContent>
      </Card>
    );
  }

  // If the driver is viewing this section (selectedVehicleId)
  if (selectedVehicleId) {
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (vehicle) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedVehicleId(null)}>
            ← Volver a vehículos
          </Button>
          <PrivateRouteDrivers
            proveedorId={proveedorId}
            productoId={selectedVehicleId}
            vehicleName={vehicle.nombre}
            businessName={businessName}
          />
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Daily assignments panel - only show when there are vehicles */}
      {vehicles.length > 0 && (
        <DailyAssignments proveedorId={proveedorId} />
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bus className="h-5 w-5" />
            Rutas Privadas - {businessName}
          </CardTitle>
          <CardDescription>
            Gestiona tus vehículos de transporte privado. $400 MXN por unidad al año.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Subscription status */}
          {subscriptionStatus?.subscribed ? (
            <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg mb-4">
              <div>
                <p className="text-sm font-medium">
                  Suscripción activa: {subscriptionStatus.quantity} unidad(es)
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
            <Alert className="mb-4">
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                Necesitas una suscripción de rutas privadas para registrar vehículos.
                Cada unidad cuesta $400 MXN al año.
              </AlertDescription>
            </Alert>
          )}

          {/* Vehicles list */}
          {vehicles.length > 0 && (
            <div className="space-y-3 mb-4">
              {vehicles.map((vehicle) => (
                <Card key={vehicle.id} className="border">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-primary shrink-0" />
                        <h4 className="font-semibold">{vehicle.nombre}</h4>
                        </div>
                        {vehicle.descripcion && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {vehicle.descripcion}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedVehicleId(vehicle.id)}
                          title="Gestionar choferes"
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Choferes
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => sendWhatsAppInviteLink(vehicle)}
                          title="Enviar enlace por WhatsApp"
                        >
                          <Link className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteVehicleId(vehicle.id)}
                          title="Eliminar vehículo"
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

          {/* Add vehicle button */}
          {subscriptionStatus?.subscribed && vehicles.length < (subscriptionStatus?.quantity || 0) && (
            <Button onClick={() => setIsDialogOpen(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Registrar Vehículo ({vehicles.length}/{subscriptionStatus.quantity})
            </Button>
          )}

          {subscriptionStatus?.subscribed && vehicles.length >= (subscriptionStatus?.quantity || 0) && (
            <Button 
              onClick={handleSubscribe} 
              disabled={addingVehicle}
              className="w-full"
            >
              {addingVehicle ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Añadir Chofer (+$400 MXN/año)</>
              )}
            </Button>
          )}

          {!subscriptionStatus?.subscribed && (
            <Button 
              onClick={handleSubscribe} 
              disabled={addingVehicle}
              className="w-full"
            >
              {addingVehicle ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Añadir Chofer ($400 MXN/unidad/año)</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog for registering a new vehicle */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Vehículo</DialogTitle>
            <DialogDescription>
              Asigna un nombre o nomenclatura a este vehículo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="vehicleName">Nombre / Nomenclatura *</Label>
              <Input
                id="vehicleName"
                value={newVehicle.nombre}
                onChange={(e) => setNewVehicle({ ...newVehicle, nombre: e.target.value })}
                placeholder="Ej: Ruta 2, Ruta Sur, Express Norte..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Define el nombre como quieras identificar este vehículo
              </p>
            </div>
            <div>
              <Label htmlFor="vehicleDesc">Recorrido / Descripción</Label>
              <Input
                id="vehicleDesc"
                value={newVehicle.descripcion}
                onChange={(e) => setNewVehicle({ ...newVehicle, descripcion: e.target.value })}
                placeholder="Ej: Colonia Centro - Zona Industrial"
              />
            </div>
            <Button onClick={handleCreateVehicle} className="w-full">
              <Bus className="h-4 w-4 mr-2" />
              Registrar Vehículo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteVehicleId} onOpenChange={() => setDeleteVehicleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vehículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el vehículo y todas sus invitaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVehicle}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
