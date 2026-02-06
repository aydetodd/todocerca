import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Check, Loader2, RefreshCw, Navigation, Share2, ChevronDown, ChevronUp, Briefcase, Bus } from 'lucide-react';

// Yellow bus SVG for driver panel
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
}

interface TodayAssignment {
  id: string;
  producto_id: string;
  vehicleName: string;
  asignado_por: string | null;
}

interface DriverCompanyData {
  driver: DriverRecord;
  vehicles: Vehicle[];
  todayAssignment: TodayAssignment | null;
}

function SingleDriverPanel({
  data,
  onRefresh,
  compact = false,
}: {
  data: DriverCompanyData;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [showRouteSelect, setShowRouteSelect] = useState(false);

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

      setShowRouteSelect(false);
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

  return (
    <div className="space-y-3">
      {/* Driver header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0"
             dangerouslySetInnerHTML={{ __html: YELLOW_BUS_SVG }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">
              Chofer: {data.driver.nombre || 'Sin nombre'}
            </h3>
            <Badge variant="default" className="text-xs">Autorizado</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Empresa: <strong>{data.driver.businessName}</strong>
          </p>
        </div>
        {data.todayAssignment && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleInviteWhatsApp}
            className="shrink-0"
          >
            <Share2 className="h-3.5 w-3.5 mr-1" />
            Invitar
          </Button>
        )}
      </div>

      {/* Today's assignment */}
      {data.todayAssignment ? (
        <div className="bg-background/80 rounded-lg p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Ruta de hoy:</p>
              <p className="font-semibold text-sm text-foreground">
                {data.todayAssignment.vehicleName}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const assignedVehicle = data.vehicles.find(v => v.id === data.todayAssignment!.producto_id);
                if (assignedVehicle?.invite_token) {
                  navigate(`/mapa?token=${assignedVehicle.invite_token}`);
                } else {
                  navigate('/mapa?type=ruta');
                }
              }}
            >
              <Navigation className="h-3 w-3 mr-1" />
              Ubicación
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRouteSelect(!showRouteSelect)}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Cambiar
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-background/80 rounded-lg p-3 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No tienes ruta asignada para hoy
          </p>
          <Button size="sm" onClick={() => setShowRouteSelect(true)}>
            <MapPin className="h-4 w-4 mr-1" />
            Seleccionar ruta
          </Button>
        </div>
      )}

      {/* Route selector */}
      {showRouteSelect && data.vehicles.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Selecciona tu ruta:</p>
          {data.vehicles.map((vehicle) => {
            const isCurrent = data.todayAssignment?.producto_id === vehicle.id;
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
    </div>
  );
}

export default function DriverProfilePanel() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<DriverCompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

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

      // Fetch ALL active driver records for this user
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

      // Load data for each company in parallel
      await Promise.all(
        drivers.map(async (driver) => {
          // Get business name
          const { data: proveedor } = await supabase
            .from('proveedores')
            .select('nombre')
            .eq('id', driver.proveedor_id)
            .single();

          // Get vehicles for this company
          const { data: vehicleList } = await supabase
            .from('productos')
            .select('id, nombre, descripcion, invite_token')
            .eq('proveedor_id', driver.proveedor_id)
            .eq('is_private', true)
            .eq('route_type', 'privada')
            .eq('is_available', true)
            .order('nombre');

          // Check today's assignment
          const { data: assignment } = await supabase
            .from('asignaciones_chofer')
            .select('id, producto_id, asignado_por, productos(nombre)')
            .eq('chofer_id', driver.id)
            .eq('fecha', today)
            .maybeSingle();

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
                }
              : null,
          });
        })
      );

      setCompanies(companiesData);

      // Auto-expand if only one company, or expand the one with an assignment
      if (companiesData.length === 1) {
        setExpandedCompany(companiesData[0].driver.id);
      } else if (!expandedCompany) {
        const withAssignment = companiesData.find(c => c.todayAssignment);
        if (withAssignment) {
          setExpandedCompany(withAssignment.driver.id);
        }
      }
    } catch (error) {
      console.error('[DriverProfilePanel] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (companies.length === 0) return null;

  // Single company — show as before (no accordion needed)
  if (companies.length === 1) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <SingleDriverPanel data={companies[0]} onRefresh={loadAllDriverData} />
        </CardContent>
      </Card>
    );
  }

  // Multiple companies — show each in a collapsible card
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Bus className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          Mis Perfiles de Chofer ({companies.length} empresas)
        </p>
      </div>

      {companies.map((companyData) => {
        const isExpanded = expandedCompany === companyData.driver.id;
        const hasAssignment = !!companyData.todayAssignment;

        return (
          <Card
            key={companyData.driver.id}
            className={`border-primary/30 bg-primary/5 transition-all ${
              hasAssignment ? 'ring-1 ring-primary/40' : ''
            }`}
          >
            <CardContent className="p-4">
              {/* Collapsed header — always visible */}
              <button
                className="w-full flex items-center justify-between gap-3"
                onClick={() => setExpandedCompany(isExpanded ? null : companyData.driver.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"
                    dangerouslySetInnerHTML={{ __html: YELLOW_BUS_SVG }}
                  />
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-sm text-foreground">
                      {companyData.driver.businessName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasAssignment
                        ? `📍 Ruta: ${companyData.todayAssignment!.vehicleName}`
                        : 'Sin ruta asignada hoy'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasAssignment && (
                    <Badge variant="default" className="text-xs">Activo</Badge>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <SingleDriverPanel data={companyData} onRefresh={loadAllDriverData} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
