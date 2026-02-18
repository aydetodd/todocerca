import React, { useState, useEffect } from 'react';
import { formatUnitOption, formatUnitLabel } from '@/lib/unitDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Plus, Trash2, Send, Loader2, User, Pencil, Bus, MapPin, ArrowRight, MessageSquare } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';

interface Driver {
  id: string;
  telefono: string;
  nombre: string | null;
  user_id: string | null;
  is_active: boolean;
  invite_token: string;
}

interface Route {
  id: string;
  nombre: string;
}

interface Unit {
  id: string;
  nombre: string;
  placas: string | null;
  descripcion: string | null;
}

interface TodayAssignment {
  id: string;
  chofer_id: string;
  producto_id: string;
  unidad_id: string | null;
}

interface PrivateRouteDriversProps {
  proveedorId: string;
  productoId: string;
  vehicleName: string;
  businessName: string;
  onDriversChanged?: () => void;
}

export default function PrivateRouteDrivers({
  proveedorId,
  productoId,
  vehicleName,
  businessName,
  onDriversChanged,
}: PrivateRouteDriversProps) {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assignments, setAssignments] = useState<TodayAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteDriverId, setDeleteDriverId] = useState<string | null>(null);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingAssignment, setSavingAssignment] = useState<string | null>(null);
  const { toast } = useToast();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchAll();

    // Subscribe to realtime changes on assignments
    const channel = supabase
      .channel(`realtime-assignments-drivers-${proveedorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asignaciones_chofer' },
        () => {
          console.log('🔄 [PrivateRouteDrivers] Assignment changed — refreshing');
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proveedorId]);

  const fetchAll = async () => {
    try {
      setLoading(true);

      const [driversRes, routesRes, unitsRes] = await Promise.all([
        supabase
          .from('choferes_empresa')
          .select('*')
          .eq('proveedor_id', proveedorId)
          .order('created_at', { ascending: true }),
        supabase
          .from('productos')
          .select('id, nombre')
          .eq('proveedor_id', proveedorId)
          .eq('is_private', true)
          .eq('route_type', 'privada')
          .eq('is_available', true)
          .order('nombre'),
        supabase
          .from('unidades_empresa')
          .select('id, nombre, placas, descripcion')
          .eq('proveedor_id', proveedorId)
          .eq('is_active', true)
          .order('nombre'),
      ]);

      const driversList = (driversRes.data || []) as Driver[];
      setDrivers(driversList);
      setRoutes((routesRes.data || []) as Route[]);
      setUnits((unitsRes.data || []) as Unit[]);

      // Fetch today's assignments for these drivers
      if (driversList.length > 0) {
        const driverIds = driversList.map(d => d.id);
        const { data: assignData } = await supabase
          .from('asignaciones_chofer')
          .select('id, chofer_id, producto_id, unidad_id')
          .eq('fecha', today)
          .in('chofer_id', driverIds);

        setAssignments((assignData || []) as TodayAssignment[]);
      } else {
        setAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRoute = async (driverId: string, routeId: string) => {
    if (!user) return;
    try {
      setSavingAssignment(driverId);
      const existing = assignments.find(a => a.chofer_id === driverId);

      if (existing) {
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({ producto_id: routeId, asignado_por: user.id })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('asignaciones_chofer')
          .insert({
            chofer_id: driverId,
            producto_id: routeId,
            fecha: today,
            asignado_por: user.id,
          });
        if (error) throw error;
      }

      // Also sync the driver's profile route_name
      const driver = drivers.find(d => d.id === driverId);
      const routeName = routes.find(r => r.id === routeId)?.nombre;
      if (driver?.user_id && routeName) {
        await supabase
          .from('profiles')
          .update({ route_name: routeName })
          .eq('user_id', driver.user_id);
      }

      toast({ title: "✅ Ruta asignada" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingAssignment(null);
    }
  };

  const getUnitAssignedToOther = (unitId: string, currentDriverId: string): string | null => {
    const otherAssignment = assignments.find(
      a => a.unidad_id === unitId && a.chofer_id !== currentDriverId
    );
    if (!otherAssignment) return null;
    const otherDriver = drivers.find(d => d.id === otherAssignment.chofer_id);
    return otherDriver?.nombre || otherDriver?.telefono || 'otro chofer';
  };

  const handleAssignUnit = async (driverId: string, unitId: string) => {
    if (!user) return;
    try {
      setSavingAssignment(driverId);
      const existing = assignments.find(a => a.chofer_id === driverId);

      if (!existing) {
        toast({
          title: "Selecciona ruta primero",
          description: "Asigna una ruta al chofer antes de asignarle unidad",
          variant: "destructive",
        });
        setSavingAssignment(null);
        return;
      }

      // Validate: unit not already assigned to another driver today
      const takenBy = getUnitAssignedToOther(unitId, driverId);
      if (takenBy) {
        const unitObj = units.find(u => u.id === unitId);
        toast({
          title: "⚠️ Unidad no disponible",
          description: `Esta unidad ya está asignada a ${takenBy} hoy. Cada unidad solo puede asignarse a un chofer por día.`,
          variant: "destructive",
        });
        setSavingAssignment(null);
        return;
      }

      const { error } = await supabase
        .from('asignaciones_chofer')
        .update({ unidad_id: unitId || null, asignado_por: user.id })
        .eq('id', existing.id);
      if (error) throw error;

      toast({ title: "✅ Unidad asignada" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingAssignment(null);
    }
  };

  const addDriverRecord = async (): Promise<Driver | null> => {
    if (!newPhone || newPhone.length < 10) {
      toast({
        title: "Error",
        description: "Ingresa un número de teléfono válido",
        variant: "destructive",
      });
      return null;
    }

    try {
      setAdding(true);
      
      const { data, error } = await supabase
        .from('choferes_empresa')
        .insert({
          proveedor_id: proveedorId,
          telefono: newPhone,
          nombre: newName || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Chofer ya registrado",
            description: "Este número ya está registrado en tu empresa",
            variant: "destructive",
          });
          return null;
        }
        throw error;
      }

      return data as Driver;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }
  };

  const handleAddDriverWhatsApp = async () => {
    const driver = await addDriverRecord();
    if (!driver) {
      setAdding(false);
      return;
    }

    const cleanPhone = newPhone.replace(/[^0-9]/g, '');
    const driverName = newName || 'Chofer';
    const acceptLink = `https://todocerca.mx/chofer-invitacion?token=${driver.invite_token}`;
    const mensaje = encodeURIComponent(
      `¡Hola ${driverName}! 👋 Has sido registrado como chofer de *"${businessName}"* en TodoCerca.\n\n` +
      `📋 Acepta tu invitación aquí:\n${acceptLink}\n\n` +
      `⚠️ Este enlace es personal e intransferible.\n\n` +
      `Al aceptar, podrás seleccionar la ruta que cubrirás cada día y compartir tu ubicación en tiempo real.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${mensaje}`, '_blank');

    toast({
      title: "Chofer agregado",
      description: `${driverName} ha sido registrado e invitado por WhatsApp`,
    });

    setNewPhone('');
    setNewName('');
    setAdding(false);
    fetchAll();
    onDriversChanged?.();
  };

  const handleAddDriverInApp = async () => {
    if (!user) return;
    const driver = await addDriverRecord();
    if (!driver) {
      setAdding(false);
      return;
    }

    const driverName = newName || 'Chofer';
    const acceptLink = `${window.location.origin}/chofer-invitacion?token=${driver.invite_token}`;

    try {
      // Find the user by phone number to send internal message
      const cleanPhone = newPhone.replace(/[^0-9]/g, '');
      const { data: targetProfile } = await supabase
        .rpc('find_user_by_phone', { phone_param: cleanPhone });

      if (targetProfile && targetProfile.length > 0) {
        const targetUserId = targetProfile[0].user_id;
        
        // Send internal message with the invitation link
        const msgText = `🚌 ¡Hola ${driverName}! Has sido registrado como chofer de "${businessName}".\n\n📋 Acepta tu invitación aquí:\n${acceptLink}\n\n⚠️ Este enlace es personal e intransferible.`;
        
        await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: targetUserId,
          message: msgText,
        });

        toast({
          title: "✅ Chofer agregado",
          description: `Invitación enviada a ${driverName} por mensaje interno`,
        });
      } else {
        // User not found in the app — still register but warn
        toast({
          title: "Chofer agregado",
          description: `${driverName} registrado, pero no se encontró su cuenta en la app. Comparte el enlace manualmente: ${acceptLink}`,
          duration: 8000,
        });
      }
    } catch (error: any) {
      console.error('Error sending internal invite:', error);
      toast({
        title: "Chofer agregado",
        description: `Registrado pero no se pudo enviar el mensaje. Enlace: ${acceptLink}`,
        duration: 8000,
      });
    }

    setNewPhone('');
    setNewName('');
    setAdding(false);
    fetchAll();
    onDriversChanged?.();
  };

  const handleDeleteDriver = async () => {
    if (!deleteDriverId) return;
    try {
      // Also delete any assignments for this driver
      await supabase
        .from('asignaciones_chofer')
        .delete()
        .eq('chofer_id', deleteDriverId);

      const { error } = await supabase
        .from('choferes_empresa')
        .delete()
        .eq('id', deleteDriverId);

      if (error) throw error;
      toast({ title: "Chofer eliminado" });
      setDeleteDriverId(null);
      fetchAll();
      onDriversChanged?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditName = async (driverId: string) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase
        .from('choferes_empresa')
        .update({ nombre: editName.trim() })
        .eq('id', driverId);

      if (error) throw error;
      toast({ title: "Nombre actualizado" });
      setEditingDriverId(null);
      setEditName('');
      fetchAll();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendGroupWhatsApp = () => {
    if (drivers.length === 0) return;
    const mensaje = encodeURIComponent(
      `¡Equipo de ${businessName}! 👋\n\n` +
      `Recuerden abrir la app TodoCerca al iniciar su ruta para compartir ubicación en tiempo real.\n\n` +
      `📱 App: https://todocerca.mx\n\n` +
      `¡Gracias por su trabajo! 🚌`
    );
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const hasRoutes = routes.length > 0;
  const hasUnits = units.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            2. Choferes
          </CardTitle>
          <CardDescription>
            Registra choferes y asígnales unidad y ruta para el día. Los choferes pueden variar, pero normalmente son fijos por unidad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add driver form */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-3">
            <Label>Agregar Chofer</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del chofer"
              />
              <PhoneInput
                value={newPhone}
                onChange={(value) => setNewPhone(value || '')}
                placeholder="WhatsApp del chofer"
                label=""
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={handleAddDriverWhatsApp} 
                disabled={adding || !newPhone}
                size="sm"
                variant="outline"
              >
                {adding ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Agregando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1" /> WhatsApp</>
                )}
              </Button>
              <Button 
                onClick={handleAddDriverInApp} 
                disabled={adding || !newPhone}
                size="sm"
              >
                {adding ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Agregando...</>
                ) : (
                  <><MessageSquare className="h-4 w-4 mr-1" /> Invitar por App</>
                )}
              </Button>
            </div>
          </div>

          {/* Drivers list with inline assignment */}
          {drivers.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Choferes registrados ({drivers.length})</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={sendGroupWhatsApp}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Mensaje grupal
                </Button>
              </div>
              {drivers.map((driver) => {
                const assignment = assignments.find(a => a.chofer_id === driver.id);
                const assignedRoute = assignment ? routes.find(r => r.id === assignment.producto_id) : null;
                const assignedUnit = assignment?.unidad_id ? units.find(u => u.id === assignment.unidad_id) : null;
                const isSaving = savingAssignment === driver.id;

                return (
                  <div 
                    key={driver.id} 
                    className="bg-background p-3 rounded-lg border space-y-2"
                  >
                    {/* Driver header */}
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        {editingDriverId === driver.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Nuevo nombre"
                              className="h-7 text-sm w-36"
                              onKeyDown={(e) => e.key === 'Enter' && handleEditName(driver.id)}
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleEditName(driver.id)}>
                              OK
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingDriverId(null)}>
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <p className="font-medium text-sm">
                            {driver.nombre || 'Sin nombre'}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">{driver.telefono}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={driver.user_id ? 'default' : 'secondary'} className="text-xs">
                          {driver.user_id ? 'Vinculado' : 'Pendiente'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingDriverId(driver.id);
                            setEditName(driver.nombre || '');
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteDriverId(driver.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Inline assignment: Route + Unit */}
                    {(hasRoutes || hasUnits) && (
                      <div className="bg-muted/20 rounded-md p-2 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          📋 Asignación de hoy
                          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {/* Route selector */}
                          {hasRoutes && (
                            <Select
                              value={assignment?.producto_id || ''}
                              onValueChange={(val) => handleAssignRoute(driver.id, val)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <div className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3 text-primary shrink-0" />
                                  <SelectValue placeholder="Ruta..." />
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                {routes.map((route) => (
                                  <SelectItem key={route.id} value={route.id} className="text-xs">
                                    {route.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {/* Unit selector */}
                          {hasUnits && (
                            <Select
                              value={assignment?.unidad_id || ''}
                              onValueChange={(val) => handleAssignUnit(driver.id, val)}
                              disabled={isSaving || !assignment?.producto_id}
                            >
                              <SelectTrigger className={`h-8 text-xs ${!assignment?.unidad_id && assignment?.producto_id ? 'border-amber-500/50' : ''}`}>
                                <div className="flex items-center gap-1 truncate">
                                  <Bus className="h-3 w-3 text-amber-500 shrink-0" />
                                  <SelectValue placeholder={assignment?.producto_id ? '⚠️ Unidad...' : 'Primero asigna ruta'} />
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                {units.map((unit) => {
                                  const takenBy = getUnitAssignedToOther(unit.id, driver.id);
                                  return (
                                    <SelectItem 
                                      key={unit.id} 
                                      value={unit.id} 
                                      className={`text-xs ${takenBy ? 'opacity-50' : ''}`}
                                      disabled={!!takenBy}
                                    >
                                      🚌 {formatUnitOption(unit)}{takenBy ? ` (asignada a ${takenBy})` : ''}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        {/* Current assignment summary */}
                        {assignedRoute && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5 flex-wrap">
                            <span className="font-medium text-foreground">{assignedRoute.nombre}</span>
                            {assignedUnit && (
                              <>
                                <ArrowRight className="h-3 w-3 shrink-0" />
                                <span className="font-medium text-foreground">
                                  🚌 {formatUnitLabel(assignedUnit)}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Warning if no routes or units exist */}
                    {!hasRoutes && !hasUnits && (
                      <p className="text-xs text-amber-600">
                        ⚠️ Registra rutas y unidades primero para poder asignar
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay choferes registrados. Agrega el primer chofer arriba.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDriverId} onOpenChange={() => setDeleteDriverId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar chofer?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este chofer y sus asignaciones. Deberás volver a agregarlo e invitarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDriver}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
