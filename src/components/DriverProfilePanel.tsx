import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Navigation, Share2, Bus, Loader2 } from 'lucide-react';

const getBusSvg = (routeType?: string | null, isPrivate?: boolean) => {
  let fill = '#FFFFFF'; let stroke = '#cccccc'; // White = public
  if (isPrivate || routeType === 'privada') { fill = '#FDB813'; stroke = '#D4960A'; } // Yellow
  else if (routeType === 'foranea') { fill = '#3B82F6'; stroke = '#2563EB'; } // Blue
  
  return `<svg width="20" height="32" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
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
  <rect x="9" y="10" width="18" height="56" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
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
};

const getBusIconBgColor = (routeType?: string | null, isPrivate?: boolean) => {
  if (isPrivate || routeType === 'privada') return 'bg-amber-100';
  if (routeType === 'foranea') return 'bg-blue-100';
  return 'bg-gray-100';
};

interface DriverRecord {
  id: string;
  nombre: string | null;
  proveedor_id: string;
  businessName: string;
}

interface Vehicle {
  id: string;
  nombre: string;
  descripcion: string | null;
  invite_token: string | null;
  is_private: boolean;
  route_type: string | null;
}

interface UnitInfo {
  nombre: string;
  descripcion: string | null;
  placas: string | null;
}

interface TodayAssignment {
  id: string;
  producto_id: string;
  vehicleName: string;
  asignado_por: string | null;
  unit: UnitInfo | null;
}

interface DriverCompanyData {
  driver: DriverRecord;
  vehicles: Vehicle[];
  todayAssignment: TodayAssignment | null;
}

function SingleDriverPanel({
  data,
  onRefresh,
}: {
  data: DriverCompanyData;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [toggling, setToggling] = useState(false);

  const isActive = !!data.todayAssignment;

  const handleToggleActive = async (turnOn: boolean) => {
    try {
      setToggling(true);

      if (!turnOn && data.todayAssignment) {
        // Apagar: eliminar asignación de hoy
        const { error } = await supabase
          .from('asignaciones_chofer')
          .delete()
          .eq('id', data.todayAssignment.id);

        if (error) throw error;

        toast({
          title: '🔴 Ruta desactivada',
          description: `Ya no apareces en "${data.todayAssignment.vehicleName}"`,
        });
      } else if (turnOn && data.vehicles.length > 0) {
        // Encender: asignar la primera ruta disponible (el usuario puede cambiarla después)
        const today = new Date().toISOString().split('T')[0];
        const firstVehicle = data.vehicles[0];

        const { error } = await supabase
          .from('asignaciones_chofer')
          .upsert(
            {
              chofer_id: data.driver.id,
              producto_id: firstVehicle.id,
              fecha: today,
            },
            { onConflict: 'chofer_id,fecha' }
          );

        if (error) throw error;

        if (user) {
          await supabase
            .from('profiles')
            .update({ route_name: firstVehicle.nombre })
            .eq('user_id', user.id);
        }

        toast({
          title: '🟢 Ruta activada',
          description: `Ahora apareces en "${firstVehicle.nombre}"`,
        });
      }

      onRefresh();
    } catch (error: any) {
      console.error('[DriverProfilePanel] Toggle error:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    } finally {
      setToggling(false);
    }
  };

  const handleInviteWhatsApp = async () => {
    if (!data.todayAssignment) return;
    const vehicle = data.vehicles.find(v => v.id === data.todayAssignment!.producto_id);
    let token = vehicle?.invite_token;

    if (!token) {
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from('productos')
        .update({ invite_token: newToken })
        .eq('id', data.todayAssignment.producto_id);

      if (error) {
        toast({ title: 'Error', description: 'No se pudo generar el enlace', variant: 'destructive' });
        return;
      }
      token = newToken;
    }

    const inviteLink = `${window.location.origin}/mapa?type=ruta&token=${token}`;
    const mensaje = encodeURIComponent(
      `🚌 ¡Sigue mi ruta "${data.todayAssignment.vehicleName}" en tiempo real!\n\n` +
      `📍 Haz clic aquí para ver dónde voy:\n${inviteLink}\n\n` +
      `Descarga TodoCerca para más servicios.`
    );
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');
  };

  const handleSelectRoute = async (vehicleId: string) => {
    try {
      setAssigning(true);
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('asignaciones_chofer')
        .upsert(
          {
            chofer_id: data.driver.id,
            producto_id: vehicleId,
            fecha: today,
          },
          { onConflict: 'chofer_id,fecha' }
        );

      if (error) throw error;

      const selectedVehicle = data.vehicles.find(v => v.id === vehicleId);
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

      onRefresh();
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

  const currentRouteId = data.todayAssignment?.producto_id || '';
  const unitInfo = data.todayAssignment?.unit;

  const driverName = data.driver.nombre || 'Sin nombre';
  const vehicleParts: string[] = [];
  if (unitInfo?.descripcion) vehicleParts.push(unitInfo.descripcion);
  if (unitInfo?.placas) vehicleParts.push(unitInfo.placas);

  return (
    <Card className={`border-primary/30 transition-all duration-300 ${isActive ? 'bg-primary/5' : 'bg-muted/30 opacity-60'}`}>
      <CardContent className="p-3 space-y-2">
        {/* Row 1: Icon + Empresa + Chofer + Unit info + Switch + Invitar */}
        <div className="flex items-center gap-2.5">
          {(() => {
            const assignedVehicle = data.todayAssignment ? data.vehicles.find(v => v.id === data.todayAssignment!.producto_id) : null;
            const rt = assignedVehicle?.route_type || null;
            const ip = assignedVehicle?.is_private || false;
            return (
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isActive ? getBusIconBgColor(rt, ip) : 'bg-muted grayscale'}`}
                dangerouslySetInnerHTML={{ __html: getBusSvg(rt, ip) }}
              />
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight">
              {data.driver.businessName}
            </p>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              Chofer: {driverName}
            </p>
            {vehicleParts.length > 0 && (
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {vehicleParts.join('    ')}
              </p>
            )}
          </div>

          {/* Toggle de encendido/apagado */}
          <div className="flex flex-col items-center shrink-0 gap-0.5">
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleActive}
              disabled={toggling}
              className="data-[state=checked]:bg-primary"
            />
            <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              {toggling ? '...' : isActive ? 'Activa' : 'Apagada'}
            </span>
          </div>

          {isActive && data.todayAssignment && (() => {
            const assignedVehicle = data.vehicles.find(v => v.id === data.todayAssignment!.producto_id);
            return assignedVehicle?.is_private ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInviteWhatsApp}
                className="shrink-0 h-8 px-2.5 text-xs"
              >
                <Share2 className="h-3 w-3 mr-1" />
                Invitar
              </Button>
            ) : null;
          })()}
        </div>

        {/* Row 2: Route selector + Ubicación (solo si está activa) */}
        {isActive && (
          <div className="flex items-center gap-2">
            <Select
              value={currentRouteId}
              onValueChange={handleSelectRoute}
              disabled={assigning}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Seleccionar ruta..." />
              </SelectTrigger>
              <SelectContent>
                {data.vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.nombre}
                    {v.descripcion ? ` — ${v.descripcion}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {data.todayAssignment && (
              <Button
                size="sm"
                className="shrink-0 h-8 px-2.5 text-xs"
                onClick={() => {
                  const vehicle = data.vehicles.find(
                    v => v.id === data.todayAssignment!.producto_id
                  );
                  if (vehicle?.invite_token) {
                    navigate(`/mapa?token=${vehicle.invite_token}`);
                  } else {
                    navigate('/mapa?type=ruta');
                  }
                }}
              >
                <Navigation className="h-3 w-3 mr-1" />
                Ubicación
              </Button>
            )}

            {assigning && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DriverProfilePanel() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<DriverCompanyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadAllDriverData();

    const channel = supabase
      .channel('realtime-assignments-driver-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asignaciones_chofer' },
        () => {
          console.log('🔄 [DriverProfilePanel] Assignment changed — refreshing');
          if (user) loadAllDriverData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadAllDriverData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const { data: drivers, error: driversError } = await supabase
        .from('choferes_empresa')
        .select('id, nombre, proveedor_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (driversError || !drivers || drivers.length === 0) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const companiesData: DriverCompanyData[] = [];

      await Promise.all(
        drivers.map(async (driver) => {
          const { data: proveedor } = await supabase
            .from('proveedores')
            .select('nombre')
            .eq('id', driver.proveedor_id)
            .single();

          const { data: vehicleList } = await supabase
            .from('productos')
            .select('id, nombre, descripcion, invite_token, is_private, route_type')
            .eq('proveedor_id', driver.proveedor_id)
            .eq('is_mobile', true)
            .eq('is_available', true)
            .order('nombre');

          const { data: assignment } = await supabase
            .from('asignaciones_chofer')
            .select('id, producto_id, asignado_por, unidad_id, productos(nombre), unidades_empresa(nombre, descripcion, placas)')
            .eq('chofer_id', driver.id)
            .eq('fecha', today)
            .maybeSingle();

          let unitData = assignment?.unidades_empresa as any;

          // Fallback: if today's assignment has no unit, get last known unit for this driver
          if (!unitData && assignment) {
            const { data: lastWithUnit } = await supabase
              .from('asignaciones_chofer')
              .select('unidades_empresa(nombre, descripcion, placas)')
              .eq('chofer_id', driver.id)
              .not('unidad_id', 'is', null)
              .order('fecha', { ascending: false })
              .limit(1)
              .maybeSingle();
            unitData = lastWithUnit?.unidades_empresa as any;
          }

          companiesData.push({
            driver: {
              id: driver.id,
              nombre: driver.nombre,
              proveedor_id: driver.proveedor_id,
              businessName: proveedor?.nombre || 'Empresa',
            },
            vehicles: (vehicleList || []) as Vehicle[],
            todayAssignment: assignment
              ? {
                  id: assignment.id,
                  producto_id: assignment.producto_id,
                  vehicleName: (assignment.productos as any)?.nombre || 'Ruta',
                  asignado_por: assignment.asignado_por,
                  unit: unitData
                    ? {
                        nombre: unitData.nombre,
                        descripcion: unitData.descripcion,
                        placas: unitData.placas,
                      }
                    : null,
                }
              : null,
          });
        })
      );

      setCompanies(companiesData);
    } catch (error) {
      console.error('[DriverProfilePanel] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || companies.length === 0) return null;

  return (
    <div className="space-y-3">
      {companies.length > 1 && (
        <div className="flex items-center gap-2 px-1">
          <Bus className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            Mis Perfiles de Chofer ({companies.length} empresas)
          </p>
        </div>
      )}

      {companies.map((companyData) => (
        <SingleDriverPanel
          key={companyData.driver.id}
          data={companyData}
          onRefresh={loadAllDriverData}
        />
      ))}
    </div>
  );
}
