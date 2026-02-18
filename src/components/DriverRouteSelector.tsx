import { useState, useEffect } from 'react';
import { formatUnitOption, formatUnitLabel } from '@/lib/unitDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bus, Check, Loader2, MapPin } from 'lucide-react';

interface Route {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface Unit {
  id: string;
  nombre: string;
  placas: string | null;
  descripcion: string | null;
}

interface DriverInfo {
  id: string;
  proveedor_id: string;
  nombre: string | null;
  business_name: string;
}

interface TodayAssignment {
  id: string;
  producto_id: string;
  unidad_id: string | null;
  routeName: string;
  unitName: string | null;
}

export default function DriverRouteSelector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [todayAssignment, setTodayAssignment] = useState<TodayAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [checked, setChecked] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  useEffect(() => {
    if (user && !checked) {
      checkDriverStatus();
    }
  }, [user]);

  const checkDriverStatus = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Check if user is a registered driver (by user_id)
      const { data: driver, error: driverError } = await supabase
        .from('choferes_empresa')
        .select('id, proveedor_id, nombre')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (driverError) {
        console.error('[DriverRouteSelector] Error checking driver:', driverError);
        setChecked(true);
        return;
      }

      // If not found by user_id, try matching by phone from profile
      let driverData = driver;
      if (!driverData) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telefono, phone')
          .eq('user_id', user.id)
          .single();

        const phone = profile?.telefono || profile?.phone;
        if (phone) {
          const normalizedPhone = phone.replace(/[^0-9]/g, '');
          
          const { data: allDrivers } = await supabase
            .from('choferes_empresa')
            .select('id, proveedor_id, nombre, telefono')
            .eq('is_active', true)
            .is('user_id', null);

          const driverByPhone = allDrivers?.find(d => {
            const driverPhone = d.telefono.replace(/[^0-9]/g, '');
            return driverPhone === normalizedPhone || 
                   driverPhone.endsWith(normalizedPhone) || 
                   normalizedPhone.endsWith(driverPhone);
          }) || null;

          if (driverByPhone) {
            await supabase
              .from('choferes_empresa')
              .update({ user_id: user.id })
              .eq('id', driverByPhone.id);

            driverData = driverByPhone;
          }
        }
      }

      if (!driverData) {
        setChecked(true);
        return;
      }

      // Get the business name
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('nombre')
        .eq('id', driverData.proveedor_id)
        .single();

      const info: DriverInfo = {
        id: driverData.id,
        proveedor_id: driverData.proveedor_id,
        nombre: driverData.nombre,
        business_name: proveedor?.nombre || 'Empresa',
      };
      setDriverInfo(info);

      // Fetch routes and units in parallel
      const [routesRes, unitsRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, descripcion')
          .eq('proveedor_id', driverData.proveedor_id)
          .eq('is_available', true)
          .eq('is_mobile', true)
          .order('nombre'),
        supabase
          .from('unidades_empresa')
          .select('id, nombre, placas, descripcion')
          .eq('proveedor_id', driverData.proveedor_id)
          .eq('is_active', true)
          .order('nombre'),
      ]);

      setRoutes((routesRes.data || []) as Route[]);
      setUnits((unitsRes.data || []) as Unit[]);

      // Check if there's already an assignment for today
      const today = new Date().toISOString().split('T')[0];
      const { data: assignment } = await supabase
        .from('asignaciones_chofer')
        .select('id, producto_id, unidad_id, productos(nombre)')
        .eq('chofer_id', driverData.id)
        .eq('fecha', today)
        .maybeSingle();

      if (assignment) {
        // Get unit name if assigned
        let unitName: string | null = null;
        if (assignment.unidad_id) {
          const matchedUnit = (unitsRes.data || []).find((u: any) => u.id === assignment.unidad_id);
          unitName = matchedUnit?.nombre || null;
        }

        setTodayAssignment({
          id: assignment.id,
          producto_id: assignment.producto_id,
          unidad_id: assignment.unidad_id,
          routeName: (assignment.productos as any)?.nombre || 'Ruta',
          unitName,
        });
        setSelectedRoute(assignment.producto_id);
        setSelectedUnit(assignment.unidad_id || '');
      }

      // Show popup if no assignment for today or to confirm
      setIsOpen(true);
      setChecked(true);
    } catch (error) {
      console.error('[DriverRouteSelector] Error:', error);
      setChecked(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!driverInfo || !selectedRoute) return;

    try {
      setAssigning(true);
      const today = new Date().toISOString().split('T')[0];
      const unitId = selectedUnit || null;

      if (todayAssignment) {
        // Update existing assignment
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({ 
            producto_id: selectedRoute,
            unidad_id: unitId,
          })
          .eq('id', todayAssignment.id);

        if (error) throw error;
      } else {
        // Create new assignment
        const { error } = await supabase
          .from('asignaciones_chofer')
          .insert({
            chofer_id: driverInfo.id,
            producto_id: selectedRoute,
            unidad_id: unitId,
            fecha: today,
          });

        if (error) throw error;
      }

      const routeName = routes.find(r => r.id === selectedRoute)?.nombre || 'Ruta';
      const selectedUnitObj = units.find(u => u.id === selectedUnit);
      const unitName = selectedUnitObj ? formatUnitLabel(selectedUnitObj) : undefined;

      // Sync profile.route_name so the map shows the correct route immediately
      // IMPORTANT: Use the exact route name from the assignment, not the profile's old value
      if (user) {
        await supabase
          .from('profiles')
          .update({ route_name: routeName })
          .eq('user_id', user.id);
        console.log(`[DriverRouteSelector] Synced profile route_name to "${routeName}"`);
      }

      toast({
        title: "✅ Ruta asignada",
        description: `Hoy cubrirás: ${routeName}${unitName ? ` en ${unitName}` : ''}`,
      });

      setIsOpen(false);
    } catch (error: any) {
      console.error('[DriverRouteSelector] Error assigning:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo asignar la ruta",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleConfirmCurrent = () => {
    toast({
      title: "✅ Ruta confirmada",
      description: `Hoy cubrirás: ${todayAssignment?.routeName}${todayAssignment?.unitName ? ` en ${todayAssignment.unitName}` : ''}`,
    });
    setIsOpen(false);
  };

  if (!driverInfo || routes.length === 0) return null;

  const hasChanges = todayAssignment 
    ? (selectedRoute !== todayAssignment.producto_id || selectedUnit !== (todayAssignment.unidad_id || ''))
    : !!selectedRoute;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-primary" />
            Selecciona tu ruta
          </DialogTitle>
          <DialogDescription>
            ¡Hola {driverInfo.nombre || 'Chofer'}! ¿Qué ruta y unidad cubrirás hoy en {driverInfo.business_name}?
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Route selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                Ruta
              </Label>
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ruta..." />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.nombre}
                      {route.descripcion ? ` — ${route.descripcion}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit selection */}
            {units.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Bus className="h-4 w-4 text-amber-500" />
                  Unidad / Autobús
                </Label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger className={!selectedUnit ? 'border-amber-500/50' : ''}>
                    <SelectValue placeholder="⚠️ Seleccionar unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        🚌 {formatUnitOption(unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Current assignment indicator */}
            {todayAssignment && !hasChanges && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Asignación actual:</span>{' '}
                  {todayAssignment.routeName}
                  {todayAssignment.unitName && ` en ${todayAssignment.unitName}`}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {todayAssignment && !hasChanges ? (
                <Button onClick={handleConfirmCurrent} className="flex-1">
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar
                </Button>
              ) : (
                <Button 
                  onClick={handleAssign} 
                  disabled={!selectedRoute || assigning}
                  className="flex-1"
                >
                  {assigning ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Asignando...</>
                  ) : todayAssignment ? (
                    'Cambiar asignación'
                  ) : (
                    'Asignar ruta'
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
