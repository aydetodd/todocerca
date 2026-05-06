import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { DriverMiniMap } from "@/components/DriverMiniMap";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Building2, Loader2, AlertCircle, Radar, Flag, Play, CheckCircle2, RotateCcw } from "lucide-react";
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

// Vibración + beep ligero para alertas dentro de la geocerca
function alertBeepVibrate() {
  try {
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.15;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 300);
  } catch {}
}

const DIR_KEY = (choferId: string, contratoId: string) =>
  `tc_trip_dir_${choferId}_${contratoId}_${getHermosilloToday()}`;

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
  // Dirección del próximo viaje: 'ida' usa origen→destino, 'vuelta' invierte.
  const [direccion, setDireccion] = useState<"ida" | "vuelta">(() => {
    try {
      const v = localStorage.getItem(DIR_KEY(choferEmpresaId, contratoId));
      return v === "vuelta" ? "vuelta" : "ida";
    } catch { return "ida"; }
  });
  const inFlightRef = useRef(false);
  const alertedStartRef = useRef(false);
  const alertedEndRef = useRef(false);

  const todayStr = getHermosilloToday();
  const hasGeofences = origenLat != null && origenLng != null && destinoLat != null && destinoLng != null;

  // Punto de salida y llegada efectivos según la dirección
  const startLat = direccion === "ida" ? origenLat : destinoLat;
  const startLng = direccion === "ida" ? origenLng : destinoLng;
  const endLat = direccion === "ida" ? destinoLat : origenLat;
  const endLng = direccion === "ida" ? destinoLng : origenLng;
  const startLabel = direccion === "ida" ? "Inicio" : "Final (regreso desde aquí)";
  const endLabel = direccion === "ida" ? "Final" : "Inicio (regreso a aquí)";

  // Persistir dirección
  useEffect(() => {
    try { localStorage.setItem(DIR_KEY(choferEmpresaId, contratoId), direccion); } catch {}
  }, [direccion, choferEmpresaId, contratoId]);

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
    return () => { supabase.removeChannel(ch); };
  }, [choferEmpresaId, loadViajes]);

  // Watch GPS continuamente
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
      (err) => setGpsError(err.message || "Error al obtener ubicación"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Distancias y banderas
  const distStart = currentPos && startLat != null && startLng != null
    ? distanceMeters(currentPos.lat, currentPos.lng, startLat, startLng) : null;
  const distEnd = currentPos && endLat != null && endLng != null
    ? distanceMeters(currentPos.lat, currentPos.lng, endLat, endLng) : null;
  const insideStart = distStart != null && distStart <= radioM;
  const insideEnd = distEnd != null && distEnd <= radioM;

  // Avisos sonoros al entrar/salir de las geocercas
  useEffect(() => {
    if (!viajeActivo && insideStart && !alertedStartRef.current) {
      alertedStartRef.current = true;
      alertBeepVibrate();
      toast.info(`📍 Estás dentro del límite del ${direccion === "ida" ? "inicio" : "final"}. Confirma para iniciar el viaje.`, { duration: 6000 });
    }
    if (!insideStart) alertedStartRef.current = false;

    if (viajeActivo && insideEnd && !alertedEndRef.current) {
      alertedEndRef.current = true;
      alertBeepVibrate();
      toast.info(`🏁 Has llegado al ${direccion === "ida" ? "final" : "inicio"}. Confirma para contar el viaje.`, { duration: 6000 });
    }
    if (!insideEnd) alertedEndRef.current = false;
  }, [insideStart, insideEnd, viajeActivo, direccion]);

  const confirmarInicio = async () => {
    if (inFlightRef.current || !currentPos) return;
    inFlightRef.current = true;
    try {
      const lastNum = viajesHoy[0]?.numero_viaje || 0;
      const { error } = await supabase.from("viajes_realizados").insert({
        contrato_id: contratoId,
        chofer_id: choferEmpresaId,
        unidad_id: unidadId,
        numero_viaje: lastNum + 1,
        fecha: todayStr,
        inicio_lat: currentPos.lat,
        inicio_lng: currentPos.lng,
        inicio_at: new Date().toISOString(),
        estado: "en_curso",
      });
      if (error) throw error;
      toast.success(`🚐 Viaje #${lastNum + 1} iniciado (${direccion})`);
    } catch (err: any) {
      toast.error(err.message || "Error al iniciar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 1500);
    }
  };

  const confirmarFin = async () => {
    if (!viajeActivo || inFlightRef.current || !currentPos) return;
    inFlightRef.current = true;
    try {
      const { error } = await supabase
        .from("viajes_realizados")
        .update({
          fin_lat: currentPos.lat,
          fin_lng: currentPos.lng,
          fin_at: new Date().toISOString(),
          estado: "completado",
        })
        .eq("id", viajeActivo.id);
      if (error) throw error;
      toast.success(`✅ Viaje #${viajeActivo.numero_viaje} (${direccion}) contabilizado`);
      // Invertir dirección automáticamente para el regreso
      setDireccion(d => (d === "ida" ? "vuelta" : "ida"));
    } catch (err: any) {
      toast.error(err.message || "Error al finalizar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 1500);
    }
  };

  const completados = viajesHoy.filter(v => v.estado === "completado").length;

  // Texto de estado
  let statusLabel = "Esperando GPS…";
  let statusColor = "text-muted-foreground";
  if (gpsError) {
    statusLabel = `GPS: ${gpsError}`;
    statusColor = "text-destructive";
  } else if (!hasGeofences) {
    statusLabel = "El concesionario no ha definido geocercas en el contrato";
    statusColor = "text-destructive";
  } else if (currentPos) {
    if (viajeActivo) {
      statusLabel = insideEnd
        ? `🏁 Dentro del ${endLabel.toLowerCase()} — confirma fin del viaje`
        : `🏁 Faltan ${Math.round(distEnd!)} m para el ${endLabel.toLowerCase()}`;
      statusColor = insideEnd ? "text-primary" : "text-muted-foreground";
    } else {
      statusLabel = insideStart
        ? `📍 Dentro del ${startLabel.toLowerCase()} — confirma inicio del viaje`
        : `📍 Estás a ${Math.round(distStart!)} m del ${startLabel.toLowerCase()}`;
      statusColor = insideStart ? "text-primary" : "text-muted-foreground";
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
              <h1 className="text-sm font-bold text-foreground">Viajes con confirmación</h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {empresaNombre || "Contrato privado"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <Radar className="h-3 w-3" /> {direccion === "ida" ? "Ida" : "Vuelta"}
          </Badge>
        </div>
      </div>

      {/* Mapa */}
      <div className="shrink-0 h-[35vh] border-b border-border">
        <DriverMiniMap routeProductId={routeProductId} />
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-40">
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
                {viajeActivo ? `En curso (${direccion})` : `Sin viaje activo`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Estado de geocerca */}
        <Card className={(viajeActivo && insideEnd) || (!viajeActivo && insideStart) ? "border-primary/40 bg-primary/5" : ""}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className={`h-4 w-4 ${statusColor}`} />
              <p className={`text-sm font-medium ${statusColor}`}>{statusLabel}</p>
            </div>
            {hasGeofences && (
              <p className="text-[11px] text-muted-foreground pl-6">
                Radio configurado: {radioM} m. Dirección actual: <strong>{direccion === "ida" ? "Ida (origen → destino)" : "Vuelta (destino → origen)"}</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Botones de confirmación */}
        {hasGeofences && (
          <div className="space-y-2">
            {!viajeActivo && (
              <Button
                size="lg"
                className="w-full h-14 text-base"
                disabled={!insideStart || inFlightRef.current}
                onClick={confirmarInicio}
              >
                <Play className="h-5 w-5 mr-2" />
                {insideStart ? `Confirmar inicio (${direccion})` : `Acércate al ${startLabel.toLowerCase()}`}
              </Button>
            )}

            {viajeActivo && (
              <Button
                size="lg"
                variant="default"
                className="w-full h-14 text-base"
                disabled={!insideEnd || inFlightRef.current}
                onClick={confirmarFin}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                {insideEnd ? `Confirmar llegada (${direccion})` : `Acércate al ${endLabel.toLowerCase()}`}
              </Button>
            )}

            {!viajeActivo && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setDireccion(d => (d === "ida" ? "vuelta" : "ida"))}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Cambiar dirección manualmente (ahora: {direccion})
              </Button>
            )}
          </div>
        )}

        {!hasGeofences && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Pide al concesionario que abra el contrato y marque en el mapa el inicio y el final de la ruta.
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
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground flex items-center gap-1">
                <Flag className="h-3 w-3" /> Viajes de hoy
              </h3>
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
