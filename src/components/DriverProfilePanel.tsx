import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bus, MapPin, Check, Loader2, RefreshCw } from 'lucide-react';

interface DriverData {
  id: string;
  nombre: string | null;
  proveedor_id: string;
  businessName: string;
}

interface Vehicle {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface TodayAssignment {
  id: string;
  producto_id: string;
  vehicleName: string;
  asignado_por: string | null;
}

export default function DriverProfilePanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todayAssignment, setTodayAssignment] = useState<TodayAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [showRouteSelect, setShowRouteSelect] = useState(false);

  useEffect(() => {
    if (user) loadDriverData();
  }, [user]);

  const loadDriverData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // Check if user is a linked driver
      const { data: driver } = await supabase
        .from('choferes_empresa')
        .select('id, nombre, proveedor_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!driver) {
        setDriverData(null);
        setLoading(false);
        return;
      }

      // Get business name
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('nombre')
        .eq('id', driver.proveedor_id)
        .single();

      setDriverData({
        id: driver.id,
        nombre: driver.nombre,
        proveedor_id: driver.proveedor_id,
        businessName: proveedor?.nombre || 'Empresa',
      });

      // Get vehicles
      const { data: vehicleList } = await supabase
        .from('productos')
        .select('id, nombre, descripcion')
        .eq('proveedor_id', driver.proveedor_id)
        .eq('is_private', true)
        .eq('route_type', 'privada')
        .eq('is_available', true)
        .order('nombre');

      setVehicles((vehicleList || []) as Vehicle[]);

      // Check today's assignment
      const today = new Date().toISOString().split('T')[0];
      const { data: assignment } = await supabase
        .from('asignaciones_chofer')
        .select('id, producto_id, asignado_por, productos(nombre)')
        .eq('chofer_id', driver.id)
        .eq('fecha', today)
        .maybeSingle();

      if (assignment) {
        setTodayAssignment({
          id: assignment.id,
          producto_id: assignment.producto_id,
          vehicleName: (assignment.productos as any)?.nombre || 'Ruta',
          asignado_por: assignment.asignado_por,
        });
      } else {
        setTodayAssignment(null);
      }
    } catch (error) {
      console.error('[DriverProfilePanel] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoute = async (vehicleId: string) => {
    if (!driverData) return;
    try {
      setAssigning(true);
      const today = new Date().toISOString().split('T')[0];

      if (todayAssignment) {
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({ producto_id: vehicleId })
          .eq('id', todayAssignment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('asignaciones_chofer')
          .insert({
            chofer_id: driverData.id,
            producto_id: vehicleId,
            fecha: today,
          });
        if (error) throw error;
      }

      const selectedVehicle = vehicles.find(v => v.id === vehicleId);
      toast({
        title: '✅ Ruta asignada',
        description: `Hoy cubrirás: ${selectedVehicle?.nombre || 'Ruta'}`,
      });

      setShowRouteSelect(false);
      await loadDriverData();
    } catch (error: any) {
      console.error('[DriverProfilePanel] Error assigning:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo asignar la ruta',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return null;
  if (!driverData) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        {/* Driver header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bus className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">
                🚌 Chofer: {driverData.nombre || 'Sin nombre'}
              </h3>
              <Badge variant="default" className="text-xs">Autorizado</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Empresa: <strong>{driverData.businessName}</strong>
            </p>
          </div>
        </div>

        {/* Today's assignment */}
        {todayAssignment ? (
          <div className="bg-background/80 rounded-lg p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Ruta de hoy:</p>
                <p className="font-semibold text-sm text-foreground">
                  {todayAssignment.vehicleName}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRouteSelect(!showRouteSelect)}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="bg-background/80 rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No tienes ruta asignada para hoy
            </p>
            <Button
              size="sm"
              onClick={() => setShowRouteSelect(true)}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Seleccionar ruta
            </Button>
          </div>
        )}

        {/* Route selector */}
        {showRouteSelect && vehicles.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground">Selecciona tu ruta:</p>
            {vehicles.map((vehicle) => {
              const isCurrent = todayAssignment?.producto_id === vehicle.id;
              return (
                <button
                  key={vehicle.id}
                  disabled={assigning}
                  onClick={() => handleSelectRoute(vehicle.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                    isCurrent
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary bg-background'
                  }`}
                >
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{vehicle.nombre}</p>
                    {vehicle.descripcion && (
                      <p className="text-xs text-muted-foreground">{vehicle.descripcion}</p>
                    )}
                  </div>
                  {isCurrent && (
                    <Badge variant="default" className="shrink-0 gap-1 text-xs">
                      <Check className="h-3 w-3" />
                      Actual
                    </Badge>
                  )}
                </button>
              );
            })}
            {assigning && (
              <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Asignando...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
