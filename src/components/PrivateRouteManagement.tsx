import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Bus, Loader2, Users, Link, Trash2, CreditCard, Route, MapPin, Pencil, Eye } from 'lucide-react';
import PrivateRouteDrivers from './PrivateRouteDrivers';
import { formatUnitLabel } from '@/lib/unitDisplay';
import { useHispanoamerica } from '@/hooks/useHispanoamerica';
import { PAISES_HISPANOAMERICA } from '@/data/paises-hispanoamerica';


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
  transportType?: 'publico' | 'foraneo' | 'privado' | 'taxi';
}

export default function PrivateRouteManagement({ proveedorId, businessName, transportType = 'privado' }: PrivateRouteManagementProps) {
  const navigate = useNavigate();
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
  
  // Geography & route catalog state for public/foraneo routes
  const [selectedPais, setSelectedPais] = useState('MX');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [selectedCiudad, setSelectedCiudad] = useState('');
  const [selectedLinea, setSelectedLinea] = useState('');
  const [selectedNombreRuta, setSelectedNombreRuta] = useState('');
  const [rutasCatalogo, setRutasCatalogo] = useState<any[]>([]);
  const [rutasLocalData, setRutasLocalData] = useState<any[]>([]);
  
  const { loading: geoLoading, getNivel1, getNivel2 } = useHispanoamerica();
  
  const selectedPaisData = PAISES_HISPANOAMERICA.find(p => p.codigo === selectedPais);
  const nivel1Options = selectedPais ? getNivel1(selectedPais) : [];
  const nivel2Options = selectedEstado ? getNivel2(selectedPais, selectedEstado) : [];
  
  // Fetch route catalog names for the selected city
  useEffect(() => {
    if (transportType === 'publico' && selectedCiudad && selectedEstado) {
      supabase
        .from('rutas_catalogo')
        .select('*')
        .eq('tipo', 'publico')
        .eq('ciudad', selectedCiudad)
        .eq('is_active', true)
        .order('linea_numero')
        .then(({ data }) => setRutasCatalogo(data || []));
    }
  }, [transportType, selectedCiudad, selectedEstado]);

  // Load local route data (UNE Hermosillo, etc.) for dynamic line/name filtering
  useEffect(() => {
    if (transportType === 'publico' && selectedCiudad) {
      const citySlug = selectedCiudad.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
      fetch(`/data/rutas/rutas-une-${citySlug}.json`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.rutas) {
            setRutasLocalData(data.rutas);
          } else {
            setRutasLocalData([]);
          }
        })
        .catch(() => setRutasLocalData([]));
    } else {
      setRutasLocalData([]);
    }
  }, [transportType, selectedCiudad]);

  // Derive available lines and route names from local data
  const availableLines = React.useMemo(() => {
    if (rutasLocalData.length === 0) return [];
    const lineMap = new Map<string, string>();
    rutasLocalData.forEach((r: any) => {
      const key = r.linea === 0 ? 'Especial' : String(r.linea);
      if (!lineMap.has(key)) {
        lineMap.set(key, r.linea === 0 ? 'Especial' : `Línea ${r.linea}`);
      }
    });
    return Array.from(lineMap.entries()).sort((a, b) => {
      if (a[0] === 'Especial') return 1;
      if (b[0] === 'Especial') return -1;
      return Number(a[0]) - Number(b[0]);
    });
  }, [rutasLocalData]);

  const routeNamesForLine = React.useMemo(() => {
    if (!selectedLinea || rutasLocalData.length === 0) return [];
    return rutasLocalData.filter((r: any) => {
      const key = r.linea === 0 ? 'Especial' : String(r.linea);
      return key === selectedLinea;
    });
  }, [selectedLinea, rutasLocalData]);

  // Auto-select route name when only one option exists for the selected line
  useEffect(() => {
    if (routeNamesForLine.length === 1 && routeNamesForLine[0].ramal) {
      setSelectedNombreRuta(routeNamesForLine[0].ramal);
    }
  }, [routeNamesForLine]);

  const { toast } = useToast();

  useEffect(() => {
    checkSubscription();
    fetchVehicles();
    fetchUnits();
    fetchDriversCount();
  }, [proveedorId]);

  // Auto-refresh when user returns from Stripe tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSubscription();
        fetchUnits();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      const routeTypeMap: Record<string, string> = { publico: 'urbana', foraneo: 'foranea', privado: 'privada', taxi: 'taxi' };
      const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'status', transportType: routeTypeMap[transportType] || 'privada' }
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
      const routeTypeMap: Record<string, string> = {
        publico: 'urbana',
        foraneo: 'foranea',
        privado: 'privada',
        taxi: 'taxi',
      };
      const routeType = routeTypeMap[transportType] || 'privada';
      
      // First get the transport category to filter properly
      const { data: category } = await supabase
        .from('product_categories')
        .select('id')
        .eq('name', 'Rutas de Transporte')
        .single();

      let query = supabase
        .from('productos')
        .select('id, nombre, descripcion, invite_token, is_available, created_at')
        .eq('proveedor_id', proveedorId)
        .eq('route_type', routeType)
        .eq('is_mobile', true)
        .order('created_at', { ascending: true });

      if (category) {
        query = query.eq('category_id', category.id);
      }

      if (transportType === 'privado') {
        query = query.eq('is_private', true);
      }

      const { data, error } = await query;
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
        .eq('transport_type', transportType)
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

  // Go directly to Stripe when no slots available
  const handleAddUnitClick = async () => {
    if (hasAvailableSlot) {
      // Slot available — open form directly
      setIsUnitDialogOpen(true);
      return;
    }

    // No slots — go to Stripe first
    try {
      setAddingUnit(true);
      const routeTypeMap2: Record<string, string> = { publico: 'urbana', foraneo: 'foranea', privado: 'privada', taxi: 'taxi' };
      const { data, error } = await supabase.functions.invoke('add-private-vehicle', {
        body: { action: 'add', transportType: routeTypeMap2[transportType] || 'privada', uiTransportType: transportType }
      });

      if (error) throw error;

      if (data?.action === 'checkout' && data?.url) {
        window.open(data.url, '_blank');
        toast({
          title: "Redirigiendo a Stripe",
          description: "Completa el pago o prueba gratis. Al volver podrás registrar tu unidad.",
        });
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

  // Register unit from the dialog (only when slot is available)
  const handleAddUnit = async () => {
    if (!newUnit.nombre.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    try {
      setAddingUnit(true);
      const { error } = await supabase
        .from('unidades_empresa')
        .insert({
          proveedor_id: proveedorId,
          nombre: newUnit.nombre.trim(),
          placas: newUnit.placas.trim() || null,
          descripcion: newUnit.descripcion.trim() || null,
          transport_type: transportType,
        });

      if (error) throw error;

      toast({
        title: "✅ Unidad registrada",
        description: `"${newUnit.nombre.trim()}" agregada a tu flota.`,
      });
      setIsUnitDialogOpen(false);
      setNewUnit({ nombre: '', placas: '', descripcion: '' });
      fetchUnits();
      checkSubscription();
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

  // After successful Stripe payment, refresh subscription and open registration form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('private_route') === 'success') {
      // Refresh subscription, then open the unit dialog
      checkSubscription().then(() => {
        setIsUnitDialogOpen(true);
        toast({
          title: "✅ Suscripción activa",
          description: "Ahora registra los datos de tu nueva unidad.",
        });
      });
    }
  }, [proveedorId]);

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
    // Validation based on transport type
    if (transportType === 'publico') {
      if (!selectedLinea || !selectedPais || !selectedEstado || !selectedCiudad) {
        toast({ title: "Error", description: "Selecciona país, estado, ciudad y número de línea", variant: "destructive" });
        return;
      }
      const routeName = selectedNombreRuta
        ? `Línea ${selectedLinea} - ${selectedNombreRuta}`
        : `Línea ${selectedLinea}`;
      
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
            nombre: routeName,
            descripcion: newVehicle.descripcion || `Transporte público - ${selectedCiudad}`,
            precio: 0,
            stock: 1,
            unit: 'viaje',
            proveedor_id: proveedorId,
            category_id: category.id,
            route_type: 'urbana',
            is_private: false,
            is_mobile: true,
            is_available: true,
            pais: selectedPais,
            estado: selectedEstado,
            ciudad: selectedCiudad,
          });
        if (error) throw error;

        toast({ title: "¡Ruta registrada!", description: `"${routeName}" agregada.` });
        setIsRouteDialogOpen(false);
        setNewVehicle({ nombre: '', descripcion: '' });
        setSelectedLinea('');
        setSelectedNombreRuta('');
        fetchVehicles();
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }

    if (!newVehicle.nombre.trim()) {
      toast({ title: "Error", description: "El nombre de la ruta es obligatorio", variant: "destructive" });
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
          descripcion: newVehicle.descripcion || `${transportType === 'taxi' ? 'Taxi' : transportType === 'foraneo' ? 'Ruta foránea' : 'Ruta privada'} - ${businessName}`,
          precio: 0,
          stock: 1,
          unit: 'viaje',
          proveedor_id: proveedorId,
          category_id: category.id,
          route_type: transportType === 'foraneo' ? 'foranea' : transportType === 'taxi' ? 'taxi' : 'privada',
          is_private: transportType === 'privado',
          is_mobile: true,
          is_available: true,
          pais: selectedPais || 'MX',
          estado: selectedEstado || null,
          ciudad: selectedCiudad || null,
        });

      if (error) throw error;

      toast({
        title: "¡Ruta registrada!",
        description: `"${newVehicle.nombre}" agregada.`,
      });

      setIsRouteDialogOpen(false);
      setNewVehicle({ nombre: '', descripcion: '' });
      fetchVehicles();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      `🚌 *${businessName}*\n\nSigue en tiempo real la ruta *"${vehicle.nombre}"*:\n\n${link}\n\n⚠️ Este enlace es personal e intransferible.\n\n📱 Descarga la app: https://todocerca.mx`
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
      {/* Fleet view button for admin */}
      {(vehicles.length > 0 || units.length > 0) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Bus className="h-5 w-5 text-amber-700" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">Mi Flota</p>
                  <p className="text-xs text-muted-foreground">
                    {units.length} unidad(es) · {driversCount} chofer(es) · {vehicles.length} ruta(s)
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => navigate('/mapa?fleet=true')}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-bold"
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver en Mapa
              </Button>
            </div>
          </CardContent>
        </Card>
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
              1. Unidades {transportType === 'taxi' ? '/ Taxis' : '/ Autobuses'}
            </CardTitle>
            <CardDescription>
              Cada unidad requiere una suscripción de {transportType === 'privado' ? '$400' : '$200'} MXN/año. <strong>¡Prueba 7 días gratis sin tarjeta!</strong> Registra tus unidades con placas o No. económico.
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
                  <span className="font-medium">🎉 ¡7 días gratis!</span> Prueba sin tarjeta. {transportType === 'privado' ? '$400' : '$200'} MXN/año por unidad después del periodo de prueba.
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
              onClick={handleAddUnitClick}
              disabled={addingUnit}
              className="w-full"
              variant={hasAvailableSlot ? 'default' : 'outline'}
            >
              {addingUnit ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
              ) : hasAvailableSlot ? (
                <><Plus className="h-4 w-4 mr-2" /> Registrar Unidad (slot disponible)</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Añadir Unidad (7 días gratis)</>
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
          transportType={transportType}
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
                          {transportType === 'privado' && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => sendWhatsAppInviteLink(vehicle)}
                              title="Enviar enlace de pasajero por WhatsApp"
                            >
                              <Link className="h-3 w-3 mr-1" />
                              4. Link Pasajeros
                            </Button>
                          )}
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
              Tienes {availableSlots} slot(s) disponible(s). Registra los datos de tu unidad.
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Registrar Unidad</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for registering a new route */}
      <Dialog open={isRouteDialogOpen} onOpenChange={(open) => {
        setIsRouteDialogOpen(open);
        if (!open) {
          setSelectedLinea('');
          setSelectedNombreRuta('');
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => {
          // Prevent closing dialog when interacting with Select dropdown items (portaled outside dialog)
          e.preventDefault();
        }}>
          <DialogHeader>
            <DialogTitle>Agregar Ruta</DialogTitle>
            <DialogDescription>
              {transportType === 'publico'
                ? 'Selecciona la ubicación y línea de transporte público.'
                : 'Registra una nomenclatura o nombre de ruta. Las rutas son ilimitadas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Geography selectors for public and foraneo */}
            {(transportType === 'publico' || transportType === 'foraneo') && (
              <>
                <div>
                  <Label>País *</Label>
                  <select
                    value={selectedPais}
                    onChange={(e) => { setSelectedPais(e.target.value); setSelectedEstado(''); setSelectedCiudad(''); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona país</option>
                    {PAISES_HISPANOAMERICA.map(p => (
                      <option key={p.codigo} value={p.codigo}>{p.bandera} {p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{selectedPaisData?.nivel1Tipo ? selectedPaisData.nivel1Tipo.charAt(0).toUpperCase() + selectedPaisData.nivel1Tipo.slice(1) : 'Estado'} *</Label>
                  <select
                    value={selectedEstado}
                    onChange={(e) => { setSelectedEstado(e.target.value); setSelectedCiudad(''); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{`Selecciona ${selectedPaisData?.nivel1Tipo || 'estado'}`}</option>
                    {nivel1Options.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{selectedPaisData?.nivel2Tipo ? selectedPaisData.nivel2Tipo.charAt(0).toUpperCase() + selectedPaisData.nivel2Tipo.slice(1) : 'Municipio'} *</Label>
                  <select
                    value={selectedCiudad}
                    onChange={(e) => setSelectedCiudad(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{`Selecciona ${selectedPaisData?.nivel2Tipo || 'municipio'}`}</option>
                    {nivel2Options.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Public transport: Línea number + route name dropdowns */}
            {transportType === 'publico' && (
              <>
                <div>
                  <Label>Número de Línea *</Label>
                  <select
                    value={selectedLinea}
                    onChange={(e) => { setSelectedLinea(e.target.value); setSelectedNombreRuta(''); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona línea</option>
                    {availableLines.length > 0
                      ? availableLines.map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))
                      : Array.from({ length: 50 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={String(n)}>Línea {n}</option>
                        ))
                    }
                  </select>
                </div>
                {selectedLinea && (
                  <div>
                    <Label>Nombre de la Ruta</Label>
                    {routeNamesForLine.length > 1 ? (
                      <select
                        value={selectedNombreRuta}
                        onChange={(e) => setSelectedNombreRuta(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Selecciona nombre de ruta</option>
                        {routeNamesForLine.map((r: any) => (
                          <option key={r.id} value={r.ramal}>{r.ramal}</option>
                        ))}
                      </select>
                    ) : routeNamesForLine.length === 1 ? (
                      <Input
                        value={routeNamesForLine[0].ramal || `Línea ${selectedLinea}`}
                        disabled
                        className="bg-muted"
                      />
                    ) : rutasCatalogo.length > 0 ? (
                      <select
                        value={selectedNombreRuta}
                        onChange={(e) => setSelectedNombreRuta(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Selecciona nombre de ruta</option>
                        {rutasCatalogo.filter(r => String(r.linea_numero) === selectedLinea).map(r => (
                          <option key={r.id} value={r.nombre_ruta || r.nombre}>{r.nombre_ruta || r.nombre}</option>
                        ))}
                        
                      </select>
                    ) : (
                      <Input
                        value={selectedNombreRuta}
                        onChange={(e) => setSelectedNombreRuta(e.target.value)}
                        placeholder="Ej: La Manga, Sahuaro, Centro..."
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {/* Foráneo and Privado: free text name */}
            {transportType !== 'publico' && (
              <div>
                <Label htmlFor="routeName">Nombre / Nomenclatura *</Label>
                <Input
                  id="routeName"
                  value={newVehicle.nombre}
                  onChange={(e) => setNewVehicle({ ...newVehicle, nombre: e.target.value })}
                  placeholder={transportType === 'foraneo' ? 'Ej: Hermosillo - Guaymas, Express Norte...' : 'Ej: Ruta 2, Ruta Sur, Express Norte...'}
                />
              </div>
            )}

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
