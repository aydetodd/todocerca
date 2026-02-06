import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Check, Loader2, RefreshCw } from 'lucide-react';

// Yellow bus SVG for driver panel — same shape as public transport bus but yellow
const YELLOW_BUS_SVG = `<svg width="24" height="40" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="18" cy="76" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
  <ellipse cx="7" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
  <ellipse cx="7" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
  <ellipse cx="29" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
  <ellipse cx="29" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
  <rect x="5" y="8" width="26" height="64" rx="4" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
  <ellipse cx="7" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
  <ellipse cx="7" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
  <ellipse cx="29" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
  <ellipse cx="29" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
  <rect x="9" y="10" width="18" height="56" rx="2" fill="#FDB813" stroke="#D4960A" stroke-width="0.5"/>
  <rect x="5" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="5" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="5" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="5" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="5" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="27" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="27" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="27" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="27" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <rect x="27" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
  <path d="M 9 10 L 9 14 L 27 14 L 27 10 Q 18 8 9 10 Z" fill="#87CEEB" opacity="0.9" stroke="#666" stroke-width="0.5"/>
  <rect x="11" y="66" width="14" height="4" rx="1" fill="#87CEEB" opacity="0.7" stroke="#666" stroke-width="0.5"/>
  <circle cx="11" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
  <circle cx="25" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
  <rect x="10" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
  <rect x="23" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
</svg>`;

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

      // Get all private vehicles for this company
      const { data: vehicleList, error: vehicleError } = await supabase
        .from('productos')
        .select('id, nombre, descripcion')
        .eq('proveedor_id', driver.proveedor_id)
        .eq('is_private', true)
        .eq('route_type', 'privada')
        .eq('is_available', true)
        .order('nombre');

      console.log('[DriverProfilePanel] Vehicles found:', vehicleList?.length, vehicleError?.message);

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

      // Use upsert to avoid duplicate key constraint violation
      // The unique constraint is on (chofer_id, fecha)
      const { error } = await supabase
        .from('asignaciones_chofer')
        .upsert(
          {
            chofer_id: driverData.id,
            producto_id: vehicleId,
            fecha: today,
          },
          { onConflict: 'chofer_id,fecha' }
        );

      if (error) throw error;

      // Sync profile.route_name so the map shows the correct route
      const selectedVehicle = vehicles.find(v => v.id === vehicleId);
      if (user && selectedVehicle) {
        await supabase
          .from('profiles')
          .update({ route_name: selectedVehicle.nombre })
          .eq('user_id', user.id);
      }

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
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0" 
               dangerouslySetInnerHTML={{ __html: YELLOW_BUS_SVG }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">
                Chofer: {driverData.nombre || 'Sin nombre'}
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