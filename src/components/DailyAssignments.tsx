import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar, Bus, User, Loader2, ArrowRight, RefreshCw, MapPin } from 'lucide-react';

interface Driver {
  id: string;
  nombre: string | null;
  telefono: string;
}

interface Route {
  id: string;
  nombre: string;
}

interface Unit {
  id: string;
  nombre: string;
  placas: string | null;
}

interface Assignment {
  id: string;
  chofer_id: string;
  producto_id: string;
  unidad_id: string | null;
  fecha: string;
  asignado_por: string | null;
  chofer_nombre: string | null;
  chofer_telefono: string;
  route_nombre: string;
  unit_nombre: string | null;
}

interface DailyAssignmentsProps {
  proveedorId: string;
}

export default function DailyAssignments({ proveedorId }: DailyAssignmentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, [proveedorId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch drivers, routes, units, and today's assignments in parallel
      const [driversRes, routesRes, unitsRes, assignmentsRes] = await Promise.all([
        supabase
          .from('choferes_empresa')
          .select('id, nombre, telefono')
          .eq('proveedor_id', proveedorId)
          .eq('is_active', true)
          .order('nombre'),
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
          .select('id, nombre, placas')
          .eq('proveedor_id', proveedorId)
          .eq('is_active', true)
          .order('nombre'),
        supabase
          .from('asignaciones_chofer')
          .select('id, chofer_id, producto_id, unidad_id, fecha, asignado_por')
          .eq('fecha', today)
          .order('created_at', { ascending: true }),
      ]);

      const driversList = (driversRes.data || []) as Driver[];
      const routesList = (routesRes.data || []) as Route[];
      const unitsList = (unitsRes.data || []) as Unit[];
      
      // Filter assignments to only those belonging to this provider's drivers
      const driverIds = driversList.map(d => d.id);
      const filteredAssignments = (assignmentsRes.data || [])
        .filter(a => driverIds.includes(a.chofer_id))
        .map(a => {
          const driver = driversList.find(d => d.id === a.chofer_id);
          const route = routesList.find(v => v.id === a.producto_id);
          const unit = a.unidad_id ? unitsList.find(u => u.id === a.unidad_id) : null;
          return {
            ...a,
            chofer_nombre: driver?.nombre || null,
            chofer_telefono: driver?.telefono || '',
            route_nombre: route?.nombre || 'Ruta desconocida',
            unit_nombre: unit?.nombre || null,
          };
        }) as Assignment[];

      setDrivers(driversList);
      setRoutes(routesList);
      setUnits(unitsList);
      setAssignments(filteredAssignments);
    } catch (error) {
      console.error('[DailyAssignments] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDriver || !selectedRoute || !user) return;

    try {
      setAssigning(true);
      const unitId = selectedUnit || null;

      // Check if this driver already has an assignment for today
      const existing = assignments.find(a => a.chofer_id === selectedDriver);

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({
            producto_id: selectedRoute,
            unidad_id: unitId,
            asignado_por: user.id,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new — multiple drivers CAN have the same route
        const { error } = await supabase
          .from('asignaciones_chofer')
          .insert({
            chofer_id: selectedDriver,
            producto_id: selectedRoute,
            unidad_id: unitId,
            fecha: today,
            asignado_por: user.id,
          });

        if (error) throw error;
      }

      const driverName = drivers.find(d => d.id === selectedDriver)?.nombre || 'Chofer';
      const routeName = routes.find(v => v.id === selectedRoute)?.nombre || 'Ruta';
      const unitName = units.find(u => u.id === selectedUnit)?.nombre;

      toast({
        title: "✅ Asignación realizada",
        description: `${driverName} → ${routeName}${unitName ? ` (${unitName})` : ''}`,
      });

      setSelectedDriver('');
      setSelectedRoute('');
      setSelectedUnit('');
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('asignaciones_chofer')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      toast({ title: "Asignación eliminada" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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

  if (drivers.length === 0 || routes.length === 0) return null;

  // Drivers not yet assigned today (but still show all routes — multiple drivers can share a route)
  const unassignedDrivers = drivers.filter(
    d => !assignments.some(a => a.chofer_id === d.id)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5" />
              Asignaciones de Hoy
            </CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchData} title="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current assignments */}
        {assignments.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Asignados hoy ({assignments.length})
            </Label>
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between bg-muted/30 p-3 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">
                    {assignment.chofer_nombre || assignment.chofer_telefono}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-1 min-w-0">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">
                      {assignment.route_nombre}
                    </span>
                  </div>
                  {assignment.unit_nombre && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <div className="flex items-center gap-1">
                        <Bus className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {assignment.unit_nombre}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={assignment.asignado_por ? 'secondary' : 'outline'} className="text-xs">
                    {assignment.asignado_por ? 'Admin' : 'Chofer'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => handleRemoveAssignment(assignment.id)}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Assign form — all drivers shown, not just unassigned, to allow reassignment */}
        {unassignedDrivers.length > 0 && (
          <div className="bg-primary/5 p-4 rounded-lg space-y-3 border border-primary/10">
            <Label className="text-sm font-medium">Asignar chofer a ruta</Label>
            <div className="grid grid-cols-1 gap-2">
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar chofer" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.nombre || driver.telefono}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ruta" />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {units.length > 0 && (
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar unidad (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.nombre}{unit.placas ? ` (${unit.placas})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              onClick={handleAssign}
              disabled={!selectedDriver || !selectedRoute || assigning}
              size="sm"
              className="w-full"
            >
              {assigning ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Asignando...</>
              ) : (
                'Asignar ruta'
              )}
            </Button>
          </div>
        )}

        {unassignedDrivers.length === 0 && assignments.length > 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            ✅ Todos los choferes tienen ruta asignada para hoy
          </p>
        )}

        {assignments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No hay asignaciones para hoy. Pre-asigna choferes arriba o ellos elegirán su ruta al abrir la app.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
