import { useState, useEffect } from 'react';
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
import { Bus, Check, Loader2, MapPin } from 'lucide-react';

interface Vehicle {
  id: string;
  nombre: string;
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
  vehicleName: string;
}

export default function DriverRouteSelector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todayAssignment, setTodayAssignment] = useState<TodayAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [checked, setChecked] = useState(false);

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
          // Try to find driver by phone and link user_id
          const { data: driverByPhone } = await supabase
            .from('choferes_empresa')
            .select('id, proveedor_id, nombre')
            .eq('telefono', phone)
            .eq('is_active', true)
            .maybeSingle();

          if (driverByPhone) {
            // Link user_id to the driver record
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

      // Fetch available private vehicles for this company
      const { data: vehicleList } = await supabase
        .from('productos')
        .select('id, nombre, descripcion')
        .eq('proveedor_id', driverData.proveedor_id)
        .eq('is_private', true)
        .eq('route_type', 'privada')
        .eq('is_available', true)
        .order('nombre');

      setVehicles((vehicleList || []) as Vehicle[]);

      // Check if there's already an assignment for today
      const today = new Date().toISOString().split('T')[0];
      const { data: assignment } = await supabase
        .from('asignaciones_chofer')
        .select('id, producto_id, productos(nombre)')
        .eq('chofer_id', driverData.id)
        .eq('fecha', today)
        .maybeSingle();

      if (assignment) {
        setTodayAssignment({
          id: assignment.id,
          producto_id: assignment.producto_id,
          vehicleName: (assignment.productos as any)?.nombre || 'Ruta',
        });
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

  const handleSelectRoute = async (vehicleId: string) => {
    if (!driverInfo) return;

    try {
      setAssigning(true);
      const today = new Date().toISOString().split('T')[0];

      if (todayAssignment) {
        // Update existing assignment
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({ producto_id: vehicleId })
          .eq('id', todayAssignment.id);

        if (error) throw error;
      } else {
        // Create new assignment
        const { error } = await supabase
          .from('asignaciones_chofer')
          .insert({
            chofer_id: driverInfo.id,
            producto_id: vehicleId,
            fecha: today,
          });

        if (error) throw error;
      }

      const selectedVehicle = vehicles.find(v => v.id === vehicleId);
      toast({
        title: "✅ Ruta asignada",
        description: `Hoy cubrirás: ${selectedVehicle?.nombre || 'Ruta'}`,
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
      description: `Hoy cubrirás: ${todayAssignment?.vehicleName}`,
    });
    setIsOpen(false);
  };

  if (!driverInfo || vehicles.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-primary" />
            Selecciona tu ruta
          </DialogTitle>
          <DialogDescription>
            ¡Hola {driverInfo.nombre || 'Chofer'}! ¿Qué ruta cubrirás hoy en {driverInfo.business_name}?
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
            {vehicles.map((vehicle) => {
              const isCurrentAssignment = todayAssignment?.producto_id === vehicle.id;
              return (
                <Card
                  key={vehicle.id}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    isCurrentAssignment ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''
                  }`}
                  onClick={() => {
                    if (isCurrentAssignment) {
                      handleConfirmCurrent();
                    } else {
                      handleSelectRoute(vehicle.id);
                    }
                  }}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{vehicle.nombre}</p>
                      {vehicle.descripcion && (
                        <p className="text-xs text-muted-foreground truncate">
                          {vehicle.descripcion}
                        </p>
                      )}
                    </div>
                    {isCurrentAssignment && (
                      <Badge variant="default" className="shrink-0 gap-1">
                        <Check className="h-3 w-3" />
                        Asignada
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {assigning && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Asignando ruta...
              </div>
            )}
          </div>
        )}

        {todayAssignment && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleConfirmCurrent}
            >
              <Check className="h-4 w-4 mr-2" />
              Confirmar ruta actual: {todayAssignment.vehicleName}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
