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
import { Plus, Bus, Loader2, Users, Link, Trash2, CreditCard, Route, MapPin, Pencil } from 'lucide-react';
import PrivateRouteDrivers from './PrivateRouteDrivers';
import { formatUnitLabel } from '@/lib/unitDisplay';
import DailyAssignments from './DailyAssignments';

interface PrivateVehicle {
  id: string;
  nombre: string;
  descripcion: string;
  invite_token: string;
  is_available: boolean;
  created_at: string;
}

interface Unit {
  id: string;
  nombre: string;
  placas: string | null;
  descripcion: string | null;
  is_active: boolean;
  created_at: string;
}

interface PrivateRouteManagementProps {
  proveedorId: string;
  businessName: string;
}

export default function PrivateRouteManagement({ proveedorId, businessName }: PrivateRouteManagementProps) {
  const [vehicles, setVehicles] = useState<PrivateVehicle[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [driversCount, setDriversCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    subscribed: boolean;
    quantity: number;
    subscription_end?: string;
  } | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [addingUnit, setAddingUnit] = useState(false);
  const [isRouteDialogOpen, setIsRouteDialogOpen] = useState(false);
  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [deleteUnitId, setDeleteUnitId] = useState<string | null>(null);
  const [showDrivers, setShowDrivers] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ nombre: '', descripcion: '' });
  const [newUnit, setNewUnit] = useState({ nombre: '', placas: '', descripcion: '' });
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnit, setEditUnit] = useState({ nombre: '', placas: '', descripcion: '' });
  const [activeTab, setActiveTab] = useState<'units' | 'routes' | 'drivers'>('units');
  const { toast } = useToast();

  useEffect(() => {
    checkSubscription();
    fetchVehicles();
    fetchUnits();
    fetchDriversCount();
  }, [proveedorId]);

  const fetchDriversCount = async () => {
    try {
      const { count, error } = await supabase
        .from('choferes_empresa')
        .select('id', { count: 'exact', head: true })
        .eq('proveedor_id', proveedorId);
      if (!error && count !== null) setDriversCount(count);
    } catch (error) {
      console.error('Error fetching drivers count:', error);
    }
  };

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

  const fetchUnits = async () => {
    try {
      const { data, error } = await supabase
        .from('unidades_empresa')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setUnits((data || []) as Unit[]);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  // Check if there are available subscription slots (paid but not yet registered)
  const availableSlots = (subscriptionStatus?.quantity || 0) - units.length;
  const hasAvailableSlot = availableSlots > 0;

  const handleAddUnit = async () => {
    if (!newUnit.nombre.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    try {
      setAddingUnit(true);

      if (hasAvailableSlot) {
        // Register directly — subscription slot available
        const { error } = await supabase
          .from('unidades_empresa')
          .insert({
            proveedor_id: proveedorId,
            nombre: newUnit.nombre.trim(),
            placas: newUnit.placas.trim() || null,
            descripcion: newUnit.descripcion.trim() || null,
          });

        if (error) throw error;

        toast({
          title: "✅ Unidad registrada",
          description: `"${newUnit.nombre.trim()}" agregada a tu flota.`,
        });
        setIsUnitDialogOpen(false);
        setNewUnit({ nombre: '', placas: '', descripcion: '' });
        fetchUnits();
      } else {
        // No available slots — redirect to Stripe checkout
        const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
          body: { action: 'add' }
        });

        if (error) throw error;

        if (data?.action === 'checkout' && data?.url) {
          localStorage.setItem('pending_unit', JSON.stringify({
            nombre: newUnit.nombre.trim(),
            placas: newUnit.placas.trim() || null,
            descripcion: newUnit.descripcion.trim() || null,
            proveedor_id: proveedorId,
          }));
          window.open(data.url, '_blank');
          toast({
            title: "Redirigiendo a pago",
            description: "Completa el pago para registrar la unidad ($400 MXN/año)",
          });
          setIsUnitDialogOpen(false);
          setNewUnit({ nombre: '', placas: '', descripcion: '' });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'No se pudo procesar',
        variant: "destructive",
      });
    } finally {
      setAddingUnit(false);
    }
  };

  // Check for pending unit registration after successful payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('private_route') === 'success') {
      const pendingUnit = localStorage.getItem('pending_unit');
      if (pendingUnit) {
        try {
          const unitData = JSON.parse(pendingUnit);
          if (unitData.proveedor_id === proveedorId) {
            registerPendingUnit(unitData);
          }
        } catch (e) {
          console.error('Error parsing pending unit:', e);
        }
        localStorage.removeItem('pending_unit');
      }
      // Refresh subscription status
      checkSubscription();
    }
  }, [proveedorId]);

  const registerPendingUnit = async (unitData: any) => {
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .insert({
          proveedor_id: unitData.proveedor_id,
          nombre: unitData.nombre,
          placas: unitData.placas,
          descripcion: unitData.descripcion,
        });

      if (error) throw error;

      toast({
        title: "¡Unidad registrada!",
        description: `"${unitData.nombre}" ha sido agregada a tu flota.`,
      });
      fetchUnits();
    } catch (error: any) {
      console.error('Error registering pending unit:', error);
    }
  };

  const handleSaveUnit = async (unitId: string) => {
    if (!editUnit.nombre.trim()) return;
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .update({
          nombre: editUnit.nombre.trim(),
          placas: editUnit.placas.trim() || null,
          descripcion: editUnit.descripcion.trim() || null,
        })
        .eq('id', unitId);

      if (error) throw error;
      toast({ title: "Unidad actualizada" });
      setEditingUnitId(null);
      fetchUnits();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteUnit = async () => {
    if (!deleteUnitId) return;
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .delete()
        .eq('id', deleteUnitId);

      if (error) throw error;
      toast({ title: "Unidad eliminada" });
      setDeleteUnitId(null);
      fetchUnits();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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



  return (
    <div className="space-y-4">
      {/* Daily assignments panel */}
      {vehicles.length > 0 && (
        <DailyAssignments proveedorId={proveedorId} />
      )}

      {/* Tab switcher - Orden: Unidades → Choferes → Rutas (+ Link pasajeros) */}
      <div className="flex gap-1">
        <Button
          variant={activeTab === 'units' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('units')}
          className="flex-1 text-xs px-2"
        >
          1. Unidades ({units.length})
        </Button>
        <Button
          variant={activeTab === 'drivers' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('drivers')}
          className="flex-1 text-xs px-2"
        >
          2. Choferes ({driversCount})
        </Button>
        <Button
          variant={activeTab === 'routes' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('routes')}
          className="flex-1 text-xs px-2"
        >
          3. Rutas ({vehicles.length})
        </Button>
      </div>

      {/* === UNITS TAB (subscription billing unit) === */}
      {activeTab === 'units' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bus className="h-5 w-5" />
              1. Unidades / Autobuses
            </CardTitle>
            <CardDescription>
              Cada unidad (autobús) requiere una suscripción de $400 MXN/año. Registra tus unidades con placas o No. económico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Subscription status */}
            {subscriptionStatus?.subscribed ? (
              <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Suscripciones: {subscriptionStatus.quantity} · Registradas: {units.length}
                  </p>
                  <Badge variant="default">Activa</Badge>
                </div>
                {availableSlots > 0 && (
                  <p className="text-xs text-primary font-medium">
                    ⚡ {availableSlots} unidad(es) pagadas sin registrar
                  </p>
                )}
                {subscriptionStatus.subscription_end && (
                  <p className="text-xs text-muted-foreground">
                    Vence: {new Date(subscriptionStatus.subscription_end).toLocaleDateString('es-MX')}
                  </p>
                )}
              </div>
            ) : (
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  Necesitas una suscripción por cada unidad (autobús). $400 MXN/año por unidad.
                </AlertDescription>
              </Alert>
            )}

            {/* Existing units list */}
            {units.length > 0 && (
              <div className="space-y-2">
                {units.map((unit) => (
                  <Card key={unit.id} className="border">
                    <CardContent className="p-3">
                      {editingUnitId === unit.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              value={editUnit.nombre}
                              onChange={(e) => setEditUnit({ ...editUnit, nombre: e.target.value })}
                              placeholder="No. Económico"
                              className="h-8 text-sm"
                            />
                            <Input
                              value={editUnit.placas}
                              onChange={(e) => setEditUnit({ ...editUnit, placas: e.target.value })}
                              placeholder="Placas"
                              className="h-8 text-sm"
                            />
                            <Input
                              value={editUnit.descripcion}
                              onChange={(e) => setEditUnit({ ...editUnit, descripcion: e.target.value })}
                              placeholder="Descripción"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleSaveUnit(unit.id)}>
                              Guardar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingUnitId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                              <Bus className="h-4 w-4 text-amber-500 shrink-0" />
                              <h4 className="font-semibold text-sm">{formatUnitLabel(unit)}</h4>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingUnitId(unit.id);
                                setEditUnit({ nombre: unit.nombre, placas: unit.placas || '', descripcion: unit.descripcion || '' });
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteUnitId(unit.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Add unit button */}
            <Button
              onClick={() => setIsUnitDialogOpen(true)}
              disabled={addingUnit}
              className="w-full"
              variant={hasAvailableSlot ? 'default' : 'outline'}
            >
              {addingUnit ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : hasAvailableSlot ? (
                <><Plus className="h-4 w-4 mr-2" /> Registrar Unidad (slot disponible)</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Añadir Unidad ($400 MXN/año)</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === DRIVERS TAB (second step - assign drivers to units) === */}
      {activeTab === 'drivers' && (
        <PrivateRouteDrivers
          proveedorId={proveedorId}
          productoId={vehicles[0]?.id || ''}
          vehicleName="Empresa"
          businessName={businessName}
          onDriversChanged={fetchDriversCount}
        />
      )}

      {/* === ROUTES TAB (third step - routes are what passengers follow) === */}
      {activeTab === 'routes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              3. Rutas / Nomenclaturas
            </CardTitle>
            <CardDescription>
              Las rutas son lo más importante para los pasajeros. Registra todas las rutas que cubres (ilimitadas y sin costo).
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
                            variant="default"
                            size="sm"
                            onClick={() => sendWhatsAppInviteLink(vehicle)}
                            title="Enviar enlace de pasajero por WhatsApp"
                          >
                            <Link className="h-3 w-3 mr-1" />
                            4. Link Pasajeros
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

      {/* Dialog for adding a new unit */}
      <Dialog open={isUnitDialogOpen} onOpenChange={setIsUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bus className="h-5 w-5" />
              Agregar Unidad
            </DialogTitle>
            <DialogDescription>
              {hasAvailableSlot 
                ? `Tienes ${availableSlots} slot(s) disponible(s). Se registrará sin costo adicional.`
                : 'Registra tu autobús. Se te redirigirá a la pasarela de pago ($400 MXN/año).'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="unitName">No. Económico o Nombre *</Label>
              <Input
                id="unitName"
                value={newUnit.nombre}
                onChange={(e) => setNewUnit({ ...newUnit, nombre: e.target.value })}
                placeholder="Ej: Unidad 15, ECO-042..."
              />
            </div>
            <div>
              <Label htmlFor="unitPlates">Placas (opcional)</Label>
              <Input
                id="unitPlates"
                value={newUnit.placas}
                onChange={(e) => setNewUnit({ ...newUnit, placas: e.target.value })}
                placeholder="Ej: ABC-1234"
              />
            </div>
            <div>
              <Label htmlFor="unitDesc">Descripción (opcional)</Label>
              <Input
                id="unitDesc"
                value={newUnit.descripcion}
                onChange={(e) => setNewUnit({ ...newUnit, descripcion: e.target.value })}
                placeholder="Ej: Mercedes-Benz Sprinter, 30 pasajeros"
              />
            </div>
            <Button
              onClick={handleAddUnit}
              disabled={addingUnit || !newUnit.nombre.trim()}
              className="w-full"
            >
              {addingUnit ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : hasAvailableSlot ? (
                <><Plus className="h-4 w-4 mr-2" /> Registrar Unidad</>
              ) : (
                <><CreditCard className="h-4 w-4 mr-2" /> Pagar y Registrar Unidad</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Delete unit confirmation */}
      <AlertDialog open={!!deleteUnitId} onOpenChange={() => setDeleteUnitId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro de esta unidad. La suscripción en Stripe permanecerá activa hasta que la canceles desde tu cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUnit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
