import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getHermosilloToday, formatShortRouteName } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Navigation, Share2, Bus, Loader2, QrCode, Users, MapPin } from 'lucide-react';
import { getTaxiSvg, getTaxiColorByStatus } from '@/lib/vehicleIcons';
import RouteQRModal from '@/components/RouteQRModal';

const getBusSvg = (routeType?: string | null, isPrivate?: boolean) => {
  let fill = '#FFFFFF'; let stroke = '#cccccc';
  if (isPrivate || routeType === 'privada') { fill = '#FDB813'; stroke = '#D4960A'; }
  else if (routeType === 'foranea') { fill = '#3B82F6'; stroke = '#2563EB'; }
  
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

const getVehicleIconSvg = (routeType?: string | null, isPrivate?: boolean, status?: string) => {
  if (routeType === 'taxi') {
    const color = getTaxiColorByStatus(status || 'available');
    return getTaxiSvg(color);
  }
  return getBusSvg(routeType, isPrivate);
};

const getVehicleIconBgColor = (routeType?: string | null, isPrivate?: boolean, status?: string) => {
  if (routeType === 'taxi') {
    if (status === 'busy') return 'bg-amber-100';
    return 'bg-green-100';
  }
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
  cobro_tipo: 'por_viaje' | 'por_pasajero' | null;
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

const normalizeRouteName = (name: string | null | undefined) => name?.trim().toLowerCase() || '';

function PassengerCountBadge({ choferId }: { choferId: string }) {
  const [publicCount, setPublicCount] = useState(0);
  const [personalCount, setPersonalCount] = useState(0);

  const loadCounts = useCallback(async () => {
    const today = getHermosilloToday();
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    const [pubRes, privRes] = await Promise.all([
      supabase
        .from('logs_validacion_qr')
        .select('id', { count: 'exact', head: true })
        .eq('chofer_id', choferId)
        .eq('resultado', 'valido')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay),
      supabase
        .from('validaciones_transporte_personal')
        .select('id', { count: 'exact', head: true })
        .eq('chofer_id', choferId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay),
    ]);

    setPublicCount(pubRes.count || 0);
    setPersonalCount(privRes.count || 0);
  }, [choferId]);

  useEffect(() => {
    loadCounts();

    const ch1 = supabase
      .channel(`passenger-pub-${choferId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_validacion_qr' }, (payload) => {
        if ((payload.new as any).chofer_id === choferId && (payload.new as any).resultado === 'valido') {
          setPublicCount(prev => prev + 1);
        }
      })
      .subscribe();

    const ch2 = supabase
      .channel(`passenger-priv-${choferId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'validaciones_transporte_personal' }, (payload) => {
        if ((payload.new as any).chofer_id === choferId) {
          setPersonalCount(prev => prev + 1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [choferId, loadCounts]);

  const total = publicCount + personalCount;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 shrink-0">
      <Users className="h-3 w-3" />
      <span className="text-xs font-bold">{total}</span>
    </div>
  );
}

function RouteQRButton({ productoId, routeName, initialToken }: { productoId: string; routeName: string; initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (token) {
    return <RouteQRModal routeName={routeName} inviteToken={token} />;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      className="h-8 px-2 text-xs"
      onClick={async () => {
        setLoading(true);
        const newToken = crypto.randomUUID();
        const { error } = await supabase
          .from('productos')
          .update({ invite_token: newToken })
          .eq('id', productoId);
        setLoading(false);
        if (error) {
          toast({ title: 'Error', description: 'No se pudo generar el QR', variant: 'destructive' });
          return;
        }
        setToken(newToken);
      }}
    >
      <QrCode className="h-3 w-3 mr-1" />
      QR
    </Button>
  );
}

// Distancia Haversine en metros
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function StartTripButton({ productoId, onClick }: { productoId: string; onClick: () => void }) {
  const [geo, setGeo] = useState<{
    origenLat: number | null;
    origenLng: number | null;
    destinoLat: number | null;
    destinoLng: number | null;
    radioM: number;
  } | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [activeTrip, setActiveTrip] = useState(false);

  // Cargar geocercas (de contrato o de ruta)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: producto } = await supabase
        .from('productos')
        .select('proveedor_id, route_origin_lat, route_origin_lng, route_destination_lat, route_destination_lng, route_geofence_radius_m')
        .eq('id', productoId)
        .maybeSingle();
      if (!producto || cancelled) return;

      let origenLat = (producto as any).route_origin_lat;
      let origenLng = (producto as any).route_origin_lng;
      let destinoLat = (producto as any).route_destination_lat;
      let destinoLng = (producto as any).route_destination_lng;
      let radioM = (producto as any).route_geofence_radius_m ?? 150;

      if ((producto as any).proveedor_id) {
        const { data: contratos } = await (supabase as any)
          .from('contratos_transporte')
          .select('origen_lat, origen_lng, destino_lat, destino_lng, geocerca_radio_m, modelo_cobro, is_active, estado')
          .eq('concesionario_id', (producto as any).proveedor_id)
          .eq('is_active', true)
          .eq('estado', 'aceptado');
        const trip = (contratos || []).find((c: any) => c.modelo_cobro === 'por_viaje');
        if (trip) {
          origenLat = trip.origen_lat ?? origenLat;
          origenLng = trip.origen_lng ?? origenLng;
          destinoLat = trip.destino_lat ?? destinoLat;
          destinoLng = trip.destino_lng ?? destinoLng;
          radioM = trip.geocerca_radio_m ?? radioM;
        }
      }

      if (!cancelled) setGeo({ origenLat, origenLng, destinoLat, destinoLng, radioM: Math.max(radioM ?? 150, 30) });
    })();
    return () => { cancelled = true; };
  }, [productoId]);

  // Ver si ya hay un viaje en curso (para no exigir geocerca de inicio)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const today = getHermosilloToday();
      const { data } = await supabase
        .from('viajes_realizados')
        .select('id')
        .eq('producto_id', productoId)
        .eq('fecha', today)
        .eq('estado', 'en_curso')
        .limit(1);
      if (!cancelled) setActiveTrip((data || []).length > 0);
    };
    check();
    const ch = supabase
      .channel(`trip-btn-${productoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes_realizados', filter: `producto_id=eq.${productoId}` }, check)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [productoId]);

  // Watch GPS en tiempo real
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const hasFences = geo && geo.origenLat != null && geo.origenLng != null && geo.destinoLat != null && geo.destinoLng != null;
  const distStart = pos && geo?.origenLat != null && geo?.origenLng != null
    ? distanceMeters(pos.lat, pos.lng, geo.origenLat, geo.origenLng) : null;
  const distEnd = pos && geo?.destinoLat != null && geo?.destinoLng != null
    ? distanceMeters(pos.lat, pos.lng, geo.destinoLat, geo.destinoLng) : null;
  const nearestDist = activeTrip ? distEnd : (distStart != null && distEnd != null ? Math.min(distStart, distEnd) : (distStart ?? distEnd));
  const inside = hasFences && nearestDist != null && nearestDist <= (geo!.radioM);

  // Si no hay geocercas configuradas, dejar pasar (no bloquear)
  const enabled = !hasFences ? true : !!inside;

  let label = activeTrip ? 'Finalizar viaje' : 'Iniciar viaje';
  if (hasFences && pos && !inside && nearestDist != null) {
    label = `${activeTrip ? 'Acércate al final' : 'Fuera de geocerca'} (${Math.round(nearestDist)} m)`;
  } else if (hasFences && !pos) {
    label = 'Esperando GPS…';
  }

  return (
    <Button
      size="sm"
      variant="default"
      disabled={!enabled}
      className={`shrink-0 h-8 px-2.5 text-xs ${enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
      onClick={onClick}
      title={enabled ? 'Registrar inicio y fin de viaje' : 'Acércate a la geocerca para activar'}
    >
      {enabled ? <Navigation className="h-3 w-3 mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
      {label}
    </Button>
  );
}

function SingleDriverPanel({
  data,
  activeRouteName,
  profileStatus,
  onRefresh,
}: {
  data: DriverCompanyData;
  activeRouteName: string | null;
  profileStatus: 'available' | 'busy' | 'offline';
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [toggling, setToggling] = useState(false);

  const hasAssignment = !!data.todayAssignment;
  const isCurrentRoute = hasAssignment && normalizeRouteName(activeRouteName) === normalizeRouteName(data.todayAssignment?.vehicleName);
  const isActive = hasAssignment && profileStatus !== 'offline' && isCurrentRoute;

  const handleToggleActive = async (turnOn: boolean) => {
    try {
      setToggling(true);

      if (!user) return;

      if (!data.todayAssignment) {
        toast({
          title: 'Sin asignación',
          description: 'Primero el concesionario debe dejarte ruta y unidad asignadas.',
          variant: 'destructive',
        });
        return;
      }

      if (!turnOn) {
        const { error } = await supabase
          .from('profiles')
          .update({ estado: 'offline' })
          .eq('user_id', user.id);

        if (error) throw error;

        toast({
          title: '🔴 Ruta desactivada',
          description: `Tu unidad y ruta quedaron guardadas en "${formatShortRouteName(data.todayAssignment.vehicleName)}"`,
        });
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({
            estado: 'available',
            route_name: data.todayAssignment.vehicleName,
          })
          .eq('user_id', user.id);

        if (error) throw error;

        // Garantizar que existe asignación con la fecha de hoy (Hermosillo) para que el mapa muestre al chofer
        const today = getHermosilloToday();
        const { data: todayRow } = await supabase
          .from('asignaciones_chofer')
          .select('id')
          .eq('chofer_id', data.driver.id)
          .eq('fecha', today)
          .maybeSingle();

        if (!todayRow) {
          // Buscar unidad para clonar (tomamos la última conocida)
          const { data: lastWithUnit } = await supabase
            .from('asignaciones_chofer')
            .select('unidad_id, asignado_por')
            .eq('chofer_id', data.driver.id)
            .not('unidad_id', 'is', null)
            .order('fecha', { ascending: false })
            .limit(1)
            .maybeSingle();

          await supabase.from('asignaciones_chofer').insert({
            chofer_id: data.driver.id,
            producto_id: data.todayAssignment.producto_id,
            unidad_id: lastWithUnit?.unidad_id || null,
            asignado_por: lastWithUnit?.asignado_por || user.id,
            fecha: today,
          });
        }

        toast({
          title: '🟢 Ruta activada',
          description: `Ahora apareces en "${formatShortRouteName(data.todayAssignment.vehicleName)}"`,
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
      `🚌 ¡Sigue mi ruta "${formatShortRouteName(data.todayAssignment.vehicleName)}" en tiempo real!\n\n` +
      `📍 Haz clic aquí para ver dónde voy:\n${inviteLink}\n\n` +
      `Descarga TodoCerca para más servicios.`
    );
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');
  };

  const handleSelectRoute = async (vehicleId: string) => {
    try {
      setAssigning(true);

      if (!data.todayAssignment || !user) {
        toast({
          title: 'Sin permiso',
          description: 'Solo puedes cambiar la ruta; la unidad la deja fija el concesionario.',
          variant: 'destructive',
        });
        return;
      }

      const today = getHermosilloToday();
      // Upsert de asignación para HOY (no sobrescribir filas viejas)
      const { data: todayRow } = await supabase
        .from('asignaciones_chofer')
        .select('id, unidad_id, asignado_por')
        .eq('chofer_id', data.driver.id)
        .eq('fecha', today)
        .maybeSingle();

      if (todayRow) {
        const { error } = await supabase
          .from('asignaciones_chofer')
          .update({ producto_id: vehicleId })
          .eq('id', todayRow.id);
        if (error) throw error;
      } else {
        const { data: lastWithUnit } = await supabase
          .from('asignaciones_chofer')
          .select('unidad_id, asignado_por')
          .eq('chofer_id', data.driver.id)
          .not('unidad_id', 'is', null)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error } = await supabase.from('asignaciones_chofer').insert({
          chofer_id: data.driver.id,
          producto_id: vehicleId,
          unidad_id: lastWithUnit?.unidad_id || null,
          asignado_por: lastWithUnit?.asignado_por || user.id,
          fecha: today,
        });
        if (error) throw error;
      }

      const selectedVehicle = data.vehicles.find(v => v.id === vehicleId);
      if (user && selectedVehicle) {
        await supabase
          .from('profiles')
          .update({ route_name: selectedVehicle.nombre, estado: 'available' })
          .eq('user_id', user.id);
      }

      toast({
        title: '✅ Ruta asignada',
        description: `Cubrirás: ${selectedVehicle?.nombre || 'Ruta'}`,
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
    <Card className={`border-primary/30 transition-all duration-300 ${hasAssignment ? 'bg-primary/5' : 'bg-muted/30 opacity-60'} ${isActive ? 'ring-1 ring-primary/30' : ''}`}>
      <CardContent className="p-3 space-y-2">
        {/* Row 1: Icon + Empresa + Chofer + Unit info + Passenger count + Switch + Invitar */}
        <div className="flex items-center gap-2.5">
          {(() => {
            const assignedVehicle = data.todayAssignment ? data.vehicles.find(v => v.id === data.todayAssignment!.producto_id) : null;
            const rt = assignedVehicle?.route_type || null;
            const ip = assignedVehicle?.is_private || false;
            return (
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isActive ? getVehicleIconBgColor(rt, ip) : 'bg-muted grayscale'}`}
                dangerouslySetInnerHTML={{ __html: getVehicleIconSvg(rt, ip) }}
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
            {data.todayAssignment && (
              <p className="text-xs text-muted-foreground leading-tight truncate">
                Ruta: {formatShortRouteName(data.todayAssignment.vehicleName)}
              </p>
            )}
            {vehicleParts.length > 0 && (
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {vehicleParts.join('    ')}
              </p>
            )}
          </div>

          {/* Live passenger count */}
          {isActive && <PassengerCountBadge choferId={data.driver.id} />}

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

          {hasAssignment && data.todayAssignment && (() => {
            const assignedVehicle = data.vehicles.find(v => v.id === data.todayAssignment!.producto_id);
            if (!assignedVehicle?.is_private) return null;
            return (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInviteWhatsApp}
                  className="h-8 px-2 text-xs"
                >
                  <Share2 className="h-3 w-3 mr-1" />
                  Invitar
                </Button>
                <RouteQRButton
                  productoId={assignedVehicle.id}
                  routeName={data.todayAssignment.vehicleName}
                  initialToken={assignedVehicle.invite_token}
                />
              </div>
            );
          })()}
        </div>

        {/* Row 2: Route selector + Cobrar + Ubicación */}
        {hasAssignment && (
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isActive && data.todayAssignment && (
              <>
                {unitInfo?.cobro_tipo === 'por_viaje' ? (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      className="shrink-0 h-8 px-2.5 text-xs bg-blue-600 hover:bg-blue-700"
                      onClick={handleInviteWhatsApp}
                      title="Compartir mi ubicación en tiempo real con pasajeros"
                    >
                      <Share2 className="h-3 w-3 mr-1" />
                      Invitar
                    </Button>
                    <StartTripButton
                      productoId={data.todayAssignment!.producto_id}
                      onClick={() => navigate(`/wallet/qr-boletos/validar?chofer=${data.driver.id}`)}
                    />
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    className="shrink-0 h-8 px-2.5 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => navigate(`/wallet/qr-boletos/validar?chofer=${data.driver.id}`)}
                  >
                    <QrCode className="h-3 w-3 mr-1" />
                    Cobrar
                  </Button>
                )}
                <Button
                  size="sm"
                  className="shrink-0 h-8 px-2.5 text-xs"
                  onClick={() => {
                    const productoId = data.todayAssignment!.producto_id;
                    navigate(`/mapa?producto=${productoId}&as=chofer`);
                  }}
                >
                  <Navigation className="h-3 w-3 mr-1" />
                  Ubicación
                </Button>
              </>
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
  const [activeRouteName, setActiveRouteName] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<'available' | 'busy' | 'offline'>('offline');

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('route_name, estado')
        .eq('user_id', user.id)
        .maybeSingle();

      setActiveRouteName(profile?.route_name || null);
      setProfileStatus((profile?.estado as 'available' | 'busy' | 'offline' | null) || 'offline');

      const { data: drivers, error: driversError } = await supabase
        .from('choferes_empresa')
        .select('id, nombre, proveedor_id, transport_type')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (driversError || !drivers || drivers.length === 0) {
        setCompanies([]);
        setLoading(false);
        return;
      }

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
            .neq('route_type', 'taxi')
            .order('nombre');

          // Use driver's transport_type to filter vehicles
          // Public routes are stored as 'urbana' in DB
          const allowedRouteTypesMap: Record<string, string[]> = {
            publico: ['urbana', 'publica'],
            foraneo: ['foranea'],
            privado: ['privada'],
            taxi: ['taxi'],
          };
          const allowedRouteTypes = allowedRouteTypesMap[(driver as any).transport_type] || null;

          // Get the LATEST assignment (permanent — not date-scoped)
          let { data: assignment } = await supabase
            .from('asignaciones_chofer')
            .select('id, producto_id, asignado_por, unidad_id, fecha, productos(nombre), unidades_empresa(nombre, descripcion, placas, cobro_tipo)')
            .eq('chofer_id', driver.id)
            .order('fecha', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Filter vehicles by the driver's transport type
          let filteredVehicles = (vehicleList || []) as Vehicle[];
          if (allowedRouteTypes) {
            filteredVehicles = filteredVehicles.filter(v => v.route_type && allowedRouteTypes.includes(v.route_type));
          }

          let unitData = assignment?.unidades_empresa as any;

          companiesData.push({
            driver: {
              id: driver.id,
              nombre: driver.nombre,
              proveedor_id: driver.proveedor_id,
              businessName: proveedor?.nombre || 'Empresa',
            },
            vehicles: filteredVehicles,
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
                        cobro_tipo: (unitData.cobro_tipo as 'por_viaje' | 'por_pasajero' | null) ?? null,
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
          activeRouteName={activeRouteName}
          profileStatus={profileStatus}
          onRefresh={loadAllDriverData}
        />
      ))}
    </div>
  );
}
