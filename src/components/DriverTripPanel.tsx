import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { DriverMiniMap } from "@/components/DriverMiniMap";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Building2, Loader2, AlertCircle, Radar } from "lucide-react";
import { getHermosilloToday } from "@/lib/utils";

interface DriverTripPanelProps {
  choferEmpresaId: string;
  contratoId: string;
  unidadId: string | null;
  routeProductId: string | null;
  empresaNombre?: string;
  origenLat?: number | null;
  origenLng?: number | null;
  destinoLat?: number | null;
  destinoLng?: number | null;
  radioM?: number;
}

type Viaje = {
  id: string;
  numero_viaje: number;
  estado: string;
  inicio_at: string | null;
  inicio_lat: number | null;
  inicio_lng: number | null;
  fin_at: string | null;
};

// Haversine en metros
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

export function DriverTripPanel({
  choferEmpresaId,
  contratoId,
  unidadId,
  routeProductId,
  empresaNombre,
  origenLat,
  origenLng,
  destinoLat,
  destinoLng,
  radioM = 150,
}: DriverTripPanelProps) {
  const [loading, setLoading] = useState(true);
  const [viajeActivo, setViajeActivo] = useState<Viaje | null>(null);
  const [viajesHoy, setViajesHoy] = useState<Viaje[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastInsideOrigenRef = useRef<boolean | null>(null);

  const todayStr = getHermosilloToday();
  const hasGeofences = origenLat != null && origenLng != null && destinoLat != null && destinoLng != null;

  const loadViajes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("viajes_realizados")
      .select("*")
      .eq("chofer_id", choferEmpresaId)
      .eq("contrato_id", contratoId)
      .eq("fecha", todayStr)
      .order("numero_viaje", { ascending: false });

    if (error) {
      console.error("Error loading viajes:", error);
      toast.error("No se pudieron cargar los viajes");
    } else {
      const list = (data || []) as Viaje[];
      setViajesHoy(list);
      setViajeActivo(list.find(v => v.estado === "en_curso") || null);
    }
    setLoading(false);
  }, [choferEmpresaId, contratoId, todayStr]);

  useEffect(() => {
    loadViajes();
    const ch = supabase
      .channel(`viajes_chofer_${choferEmpresaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "viajes_realizados", filter: `chofer_id=eq.${choferEmpresaId}` },
        () => loadViajes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [choferEmpresaId, loadViajes]);

  // Watch GPS position continuously
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS no disponible en este dispositivo");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGpsError(err.message || "Error al obtener ubicación");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Auto trigger logic on each GPS update
  useEffect(() => {
    if (!hasGeofences || !currentPos || inFlightRef.current) return;

    const distOrigen = distanceMeters(currentPos.lat, currentPos.lng, origenLat!, origenLng!);
    const distDestino = distanceMeters(currentPos.lat, currentPos.lng, destinoLat!, destinoLng!);
    const insideOrigen = distOrigen <= radioM;
    const insideDestino = distDestino <= radioM;

    // INICIO automático: estaba dentro del origen y salió
    if (
      !viajeActivo &&
      lastInsideOrigenRef.current === true &&
      !insideOrigen
    ) {
      autoIniciar(currentPos);
    }

    // FIN automático: hay viaje activo y entró al destino
    if (viajeActivo && insideDestino) {
      autoFinalizar(currentPos);
    }

    lastInsideOrigenRef.current = insideOrigen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPos, viajeActivo, hasGeofences, origenLat, origenLng, destinoLat, destinoLng, radioM]);

  const autoIniciar = async (pos: { lat: number; lng: number }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const lastNum = viajesHoy[0]?.numero_viaje || 0;
      const { error } = await supabase.from("viajes_realizados").insert({
        contrato_id: contratoId,
        chofer_id: choferEmpresaId,
        unidad_id: unidadId,
        numero_viaje: lastNum + 1,
        fecha: todayStr,
        inicio_lat: pos.lat,
        inicio_lng: pos.lng,
        inicio_at: new Date().toISOString(),
        estado: "en_curso",
      });
      if (error) throw error;
      toast.success(`🚐 Viaje #${lastNum + 1} iniciado automáticamente`);
    } catch (err: any) {
      toast.error(err.message || "Error al iniciar viaje automático");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 3000);
    }
  };

  const autoFinalizar = async (pos: { lat: number; lng: number }) => {
    if (!viajeActivo || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { error } = await supabase
        .from("viajes_realizados")
        .update({
          fin_lat: pos.lat,
          fin_lng: pos.lng,
          fin_at: new Date().toISOString(),
          estado: "completado",
        })
        .eq("id", viajeActivo.id);
      if (error) throw error;
      toast.success(`✅ Viaje #${viajeActivo.numero_viaje} completado automáticamente`);
    } catch (err: any) {
      toast.error(err.message || "Error al finalizar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 3000);
    }
  };

  const completados = viajesHoy.filter(v => v.estado === "completado").length;

  // Estados visuales
  let statusLabel = "Esperando GPS…";
  let statusColor = "text-muted-foreground";
  if (gpsError) {
    statusLabel = `GPS: ${gpsError}`;
    statusColor = "text-destructive";
  } else if (!hasGeofences) {
    statusLabel = "El concesionario no ha definido geocercas en el contrato";
    statusColor = "text-destructive";
  } else if (currentPos) {
    const dOrigen = distanceMeters(currentPos.lat, currentPos.lng, origenLat!, origenLng!);
    const dDestino = distanceMeters(currentPos.lat, currentPos.lng, destinoLat!, destinoLng!);
    if (viajeActivo) {
      statusLabel = `🏭 Faltan ${Math.round(dDestino)} m para la maquiladora`;
      statusColor = "text-primary";
    } else if (dOrigen <= radioM) {
      statusLabel = `🚏 En el origen — sal del radio para iniciar viaje`;
      statusColor = "text-primary";
    } else {
      statusLabel = `🚏 Estás a ${Math.round(dOrigen)} m del origen`;
      statusColor = "text-muted-foreground";
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BackButton />
            <div>
              <h1 className="text-sm font-bold text-foreground">Viajes automáticos</h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {empresaNombre || "Contrato privado"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <Radar className="h-3 w-3" /> Auto
          </Badge>
        </div>
      </div>

      {/* Mapa */}
      <div className="shrink-0 h-[40vh] border-b border-border">
        <DriverMiniMap routeProductId={routeProductId} />
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28">
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-3xl font-bold text-foreground">{completados}</p>
              <p className="text-[10px] text-muted-foreground">Viajes hoy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-3xl font-bold text-primary">
                {viajeActivo ? `#${viajeActivo.numero_viaje}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {viajeActivo ? "En curso" : "Sin viaje activo"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Estado de geocerca */}
        <Card className={viajeActivo ? "border-primary/40 bg-primary/5" : ""}>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <MapPin className={`h-4 w-4 ${statusColor}`} />
              <p className={`text-sm font-medium ${statusColor}`}>{statusLabel}</p>
            </div>
            {hasGeofences && (
              <p className="text-[11px] text-muted-foreground pl-6">
                Radio configurado: {radioM} m. El sistema cuenta tus viajes solo.
              </p>
            )}
          </CardContent>
        </Card>

        {!hasGeofences && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Pide al concesionario que abra el contrato y marque en el mapa el punto de salida y la maquiladora.
              </p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Historial del día */}
        {viajesHoy.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Viajes de hoy</h3>
              <div className="space-y-1.5">
                {viajesHoy.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="font-medium">Viaje #{v.numero_viaje}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {v.inicio_at ? new Date(v.inicio_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        {v.fin_at && ` → ${new Date(v.fin_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                      <Badge variant={v.estado === "completado" ? "default" : v.estado === "en_curso" ? "secondary" : "outline"} className="text-[10px]">
                        {v.estado === "completado" ? "✓" : v.estado === "en_curso" ? "..." : "X"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
