import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { DriverMiniMap } from "@/components/DriverMiniMap";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MapPin,
  Building2,
  Loader2,
  AlertCircle,
  Radar,
  Flag,
  Play,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
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
  /** Si es true, los viajes posteriores al primero se cuentan automáticamente al entrar/salir de las geocercas. Solo para rutas foráneas. */
  autoMode?: boolean;
}

type Direccion = "AB" | "BA";

type Viaje = {
  id: string;
  numero_viaje: number;
  estado: string;
  inicio_at: string | null;
  inicio_lat: number | null;
  inicio_lng: number | null;
  fin_at: string | null;
  direccion: Direccion | null;
  inicio_manual: boolean | null;
  fin_manual: boolean | null;
  pasajeros_subidos?: number | null;
  pasajeros_bajados?: number | null;
  pasajeros_a_bordo?: number | null;
};

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
  radioM: radioMProp = 50,
  autoMode = false,
}: DriverTripPanelProps) {
  // Radio configurado por el concesionario; mínimo defensivo de 30 m por precisión GPS típica.
  const radioM = Math.max(radioMProp ?? 50, 30);
  const [loading, setLoading] = useState(true);
  const [viajeActivo, setViajeActivo] = useState<Viaje | null>(null);
  const [viajesHoy, setViajesHoy] = useState<Viaje[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Diálogo para elegir dirección AB / BA antes de iniciar
  const [askDir, setAskDir] = useState(false);
  // (Auto mode) – ya no se piden diálogos de inicio de jornada: todo es automático.
  // Diálogo de inicio/fin manual (sin GPS o fuera de geocerca)
  const [manualStartDir, setManualStartDir] = useState<Direccion | null>(null);
  const [manualEndOpen, setManualEndOpen] = useState(false);
  const inFlightRef = useRef(false);
  // ---- Modo automático (foráneas) ----
  // La jornada ahora es totalmente automática: siempre activa durante el día
  // (Hermosillo, UTC-7). El cron `close-overnight-trips` cierra cualquier viaje
  // abierto al cambio de día.
  const jornadaKey = `jornada_activa_${choferEmpresaId}`;
  const jornadaDateKey = `jornada_activa_date_${choferEmpresaId}`;
  const lastFenceKey = `jornada_last_fence_${choferEmpresaId}`;
  const lastFenceDateKey = `jornada_last_fence_date_${choferEmpresaId}`;
  const lastActionAtKey = `jornada_last_action_at_${choferEmpresaId}`;
  // En auto mode la jornada siempre está activa. Mantenemos los nombres por
  // compatibilidad con el resto de efectos, pero ya no hay botones.
  const jornadaActiva = autoMode;
  const setJornadaActiva = (_v: boolean) => { /* no-op: jornada automática */ };

  // Limpieza diaria de claves residuales (cambio de fecha Hermosillo).
  useEffect(() => {
    if (!autoMode) return;
    const cleanIfNewDay = () => {
      try {
        const today = getHermosilloToday();
        const savedDate = localStorage.getItem(jornadaDateKey);
        if (savedDate && savedDate !== today) {
          localStorage.removeItem(lastFenceKey);
          localStorage.removeItem(lastFenceDateKey);
          localStorage.removeItem(lastActionAtKey);
        }
        localStorage.setItem(jornadaKey, "1");
        localStorage.setItem(jornadaDateKey, today);
      } catch {}
    };
    cleanIfNewDay();
    const interval = setInterval(cleanIfNewDay, 60_000);
    return () => clearInterval(interval);
  }, [autoMode, jornadaKey, jornadaDateKey, lastFenceKey, lastFenceDateKey, lastActionAtKey]);

  // Última geocerca recién cerrada (persistido para sobrevivir recargas).
  const lastClosedFenceRef = useRef<"A" | "B" | null>(null);
  // Anti-rebote por geocerca (60 s). También persistido.
  const lastAutoActionAtRef = useRef<number>(0);

  // Hidratar refs desde localStorage al montar (solo si la fecha guardada es hoy).
  useEffect(() => {
    try {
      const today = getHermosilloToday();
      const fenceDate = localStorage.getItem(lastFenceDateKey);
      if (fenceDate === today) {
        const f = localStorage.getItem(lastFenceKey);
        if (f === "A" || f === "B") lastClosedFenceRef.current = f;
        const t = parseInt(localStorage.getItem(lastActionAtKey) || "0", 10);
        if (!isNaN(t)) lastAutoActionAtRef.current = t;
      }
    } catch {}
  }, [lastFenceKey, lastFenceDateKey, lastActionAtKey]);

  const setLastClosedFence = useCallback((fence: "A" | "B" | null) => {
    lastClosedFenceRef.current = fence;
    try {
      if (fence) {
        localStorage.setItem(lastFenceKey, fence);
        localStorage.setItem(lastFenceDateKey, getHermosilloToday());
      } else {
        localStorage.removeItem(lastFenceKey);
        localStorage.removeItem(lastFenceDateKey);
      }
    } catch {}
  }, [lastFenceKey, lastFenceDateKey]);

  const setLastActionAt = useCallback((ts: number) => {
    lastAutoActionAtRef.current = ts;
    try { localStorage.setItem(lastActionAtKey, String(ts)); } catch {}
  }, [lastActionAtKey]);

  const todayStr = getHermosilloToday();
  const hasGeofences =
    origenLat != null && origenLng != null && destinoLat != null && destinoLng != null;

  // Para un viaje activo: A=origen, B=destino. Si direccion=AB → start=A, end=B. Si BA → start=B, end=A.
  const dirActiva: Direccion | null = (viajeActivo?.direccion as Direccion) ?? null;
  const startLat = dirActiva === "BA" ? destinoLat : origenLat;
  const startLng = dirActiva === "BA" ? destinoLng : origenLng;
  const endLat = dirActiva === "BA" ? origenLat : destinoLat;
  const endLng = dirActiva === "BA" ? origenLng : destinoLng;

  const loadViajes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("viajes_realizados")
      .select("*")
      .eq("chofer_id", choferEmpresaId)
      .eq("fecha", todayStr);
    if (routeProductId) {
      query = query.eq("producto_id", routeProductId);
    } else {
      query = query.eq("contrato_id", contratoId);
    }
    const { data, error } = await query.order("numero_viaje", { ascending: false });

    if (error) {
      console.error("Error loading viajes:", error);
      toast.error("No se pudieron cargar los viajes");
    } else {
      const list = (data || []) as unknown as Viaje[];
      setViajesHoy(list);
      const activo = list.find(v => v.estado === "en_curso") || null;
      setViajeActivo(activo);
      // Si no hay viaje activo y no tenemos memoria de la última geocerca,
      // inferirla del último viaje completado de hoy para que el auto-mode
      // pueda arrancar el siguiente al salir de esa geocerca (sobrevive a recargas).
      if (!activo && !lastClosedFenceRef.current) {
        const lastCompleted = list.find(v => v.estado === "completado" && v.direccion);
        if (lastCompleted) {
          // BA cierra en A; AB cierra en B.
          const fence: "A" | "B" = lastCompleted.direccion === "BA" ? "A" : "B";
          setLastClosedFence(fence);
        }
      }
    }
    setLoading(false);

  }, [choferEmpresaId, contratoId, routeProductId, todayStr, setLastClosedFence]);

  useEffect(() => {
    loadViajes();
    const ch = supabase
      .channel(`viajes_chofer_${choferEmpresaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "viajes_realizados", filter: `chofer_id=eq.${choferEmpresaId}` },
        () => loadViajes()
      )
      .subscribe((status) => {
        console.log(`[DriverTripPanel] realtime status: ${status}`);
      });

    // Polling de respaldo cada 10 s mientras la pestaña está visible.
    // Garantiza que el panel refleje el inicio/cierre automático aun si
    // realtime se cae (red móvil intermitente, segundo plano, etc.).
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") loadViajes();
    }, 10_000);

    // Refrescar al volver a la pestaña/app (foreground).
    const onVis = () => {
      if (document.visibilityState === "visible") loadViajes();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [choferEmpresaId, loadViajes]);

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
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Distancias a A y B (antes de iniciar) y a end (durante viaje)
  const distA = currentPos && origenLat != null && origenLng != null
    ? distanceMeters(currentPos.lat, currentPos.lng, origenLat, origenLng) : null;
  const distB = currentPos && destinoLat != null && destinoLng != null
    ? distanceMeters(currentPos.lat, currentPos.lng, destinoLat, destinoLng) : null;
  const insideA = distA != null && distA <= radioM;
  const insideB = distB != null && distB <= radioM;

  const distEnd = currentPos && endLat != null && endLng != null
    ? distanceMeters(currentPos.lat, currentPos.lng, endLat, endLng) : null;
  const insideEnd = distEnd != null && distEnd <= radioM;

  // Aviso al llegar al final del viaje activo
  const alertedEndRef = useRef(false);
  useEffect(() => {
    if (viajeActivo && insideEnd && !alertedEndRef.current) {
      alertedEndRef.current = true;
      alertBeepVibrate();
      const msg = autoMode
        ? `🏁 Llegada al punto ${dirActiva === "BA" ? "A" : "B"} detectada. Viaje cerrándose automáticamente.`
        : `🏁 Llegaste al punto ${dirActiva === "BA" ? "A" : "B"}. Confirma para cerrar el viaje.`;
      toast.info(msg, { duration: 6000 });
    }
    if (!insideEnd) alertedEndRef.current = false;
  }, [insideEnd, viajeActivo, dirActiva, autoMode]);

  // ---- AUTO MODE: cierre y arranque automático por geocerca ----
  // Cierra automáticamente el viaje activo al entrar a la geocerca destino.
  // Si el viaje inició desde un punto intermedio (direccion = null), también se cierra
  // al llegar a CUALQUIER geocerca (A o B) y se le asigna la dirección correspondiente.
  useEffect(() => {
    if (!autoMode) return;
    if (!viajeActivo || !currentPos || inFlightRef.current) return;

    // Determinar si llegó a una geocerca válida para cerrar
    let arrivedFence: "A" | "B" | null = null;
    let resolvedDir: Direccion | null = dirActiva;
    if (dirActiva) {
      if (insideEnd) arrivedFence = dirActiva === "BA" ? "A" : "B";
    } else {
      // Viaje sin dirección: se cierra al llegar a A o B y se asigna la dirección.
      if (insideA) { arrivedFence = "A"; resolvedDir = "BA"; }
      else if (insideB) { arrivedFence = "B"; resolvedDir = "AB"; }
    }
    if (!arrivedFence) return;

    const now = Date.now();
    if (now - lastAutoActionAtRef.current < 60_000) return; // anti-rebote 60 s
    setLastActionAt(now);
    setLastClosedFence(arrivedFence);
    if (!jornadaActiva) {
      try { localStorage.setItem(jornadaKey, "1"); localStorage.setItem(jornadaDateKey, getHermosilloToday()); } catch {}
      setJornadaActiva(true);
    }
    (async () => {
      inFlightRef.current = true;
      try {
        const { error } = await supabase
          .from("viajes_realizados")
          .update({
            fin_lat: currentPos.lat,
            fin_lng: currentPos.lng,
            fin_at: new Date().toISOString(),
            estado: "completado",
            fin_manual: false,
            direccion: resolvedDir,
          } as any)
          .eq("id", viajeActivo.id);
        if (error) throw error;
        await loadViajes();
        toast.success(`✅ Viaje #${viajeActivo.numero_viaje} (${resolvedDir}) cerrado automáticamente al llegar al punto ${arrivedFence}`);
      } catch (err: any) {
        toast.error(err.message || "Error cerrando viaje auto");
      } finally {
        setTimeout(() => { inFlightRef.current = false; }, 1500);
      }
    })();
  }, [autoMode, jornadaActiva, viajeActivo, insideEnd, insideA, insideB, currentPos, dirActiva, jornadaKey, jornadaDateKey, setLastActionAt, setLastClosedFence]);


  // Arranca automáticamente el siguiente viaje al SALIR de la geocerca recién alcanzada.
  useEffect(() => {
    if (!autoMode || !jornadaActiva) return;
    if (viajeActivo || inFlightRef.current || !currentPos) return;
    const lastFence = lastClosedFenceRef.current;
    if (!lastFence) return;
    const stillInside = lastFence === "A" ? insideA : insideB;
    if (stillInside) return; // espera a que salga
    const now = Date.now();
    if (now - lastAutoActionAtRef.current < 60_000) return;
    setLastActionAt(now);
    const nextDir: Direccion = lastFence === "A" ? "AB" : "BA";
    setLastClosedFence(null);
    insertViaje(nextDir, { lat: currentPos.lat, lng: currentPos.lng, manual: false });
  }, [autoMode, jornadaActiva, viajeActivo, currentPos, insideA, insideB, setLastActionAt, setLastClosedFence]);



  // ---- AUTO MODE: arranca automáticamente el primer viaje sin dirección ----
  // Al abrir el panel, si la jornada está activa, no hay viaje en curso, no hay
  // viajes hoy y aún no hay geocerca cerrada, se crea automáticamente un viaje
  // (direccion=null) que se completará solo al llegar a A o B.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoMode || !hasGeofences) return;
    if (autoStartedRef.current) return;
    if (loading) return;
    if (viajeActivo) return;
    if (viajesHoy.length > 0) return;
    if (lastClosedFenceRef.current) return;
    if (inFlightRef.current) return;
    autoStartedRef.current = true;
    const lat = currentPos?.lat ?? null;
    const lng = currentPos?.lng ?? null;
    insertViaje(null, { lat, lng, manual: lat == null });
    setLastActionAt(Date.now());
  }, [autoMode, hasGeofences, loading, viajeActivo, viajesHoy.length, currentPos, setLastActionAt]);

  const insertViaje = async (
    direccion: Direccion | null,
    opts: { lat: number | null; lng: number | null; manual: boolean }
  ) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const lastNum = viajesHoy[0]?.numero_viaje || 0;
      const { error } = await supabase.from("viajes_realizados").insert({
        contrato_id: routeProductId ? null : contratoId,
        producto_id: routeProductId,
        chofer_id: choferEmpresaId,
        unidad_id: unidadId,
        numero_viaje: lastNum + 1,
        fecha: todayStr,
        inicio_lat: opts.lat,
        inicio_lng: opts.lng,
        inicio_at: new Date().toISOString(),
        estado: "en_curso",
        direccion,
        inicio_manual: opts.manual,
      } as any);
      if (error) throw error;
      await loadViajes();
      const label = direccion ?? "sin dirección (se define al llegar a A o B)";
      toast.success(
        `🚐 Viaje #${lastNum + 1} iniciado (${label}${opts.manual ? " · manual" : ""})`
      );
    } catch (err: any) {
      toast.error(err.message || "Error al iniciar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 1500);
    }
  };


  // Confirma inicio con GPS (validando geocerca correcta según AB/BA)
  const confirmarInicioGPS = async (dir: Direccion) => {
    if (!currentPos) {
      toast.error("Esperando ubicación GPS…");
      return;
    }
    const okGeo = dir === "AB" ? insideA : insideB;
    if (!okGeo) {
      toast.error(
        dir === "AB"
          ? `Para iniciar AB debes estar dentro del Punto A (faltan ${distA != null ? Math.round(distA) + " m" : "—"}).`
          : `Para iniciar BA debes estar dentro del Punto B (faltan ${distB != null ? Math.round(distB) + " m" : "—"}).`
      );
      return;
    }
    await insertViaje(dir, { lat: currentPos.lat, lng: currentPos.lng, manual: false });
  };

  // Inicio manual (sin GPS o fuera de geocerca): el chofer declara desde dónde sale
  const confirmarInicioManual = async (dir: Direccion) => {
    setManualStartDir(null);
    setAskDir(false);
    await insertViaje(dir, { lat: null, lng: null, manual: true });
  };

  const confirmarFinGPS = async () => {
    if (!viajeActivo || inFlightRef.current || !currentPos) return;
    if (!insideEnd) {
      toast.error(
        `Aún no llegas al punto ${dirActiva === "BA" ? "A" : "B"} (faltan ${distEnd != null ? Math.round(distEnd) + " m" : "—"}).`
      );
      return;
    }
    inFlightRef.current = true;
    try {
      const { error } = await supabase
        .from("viajes_realizados")
        .update({
          fin_lat: currentPos.lat,
          fin_lng: currentPos.lng,
          fin_at: new Date().toISOString(),
          estado: "completado",
          fin_manual: false,
        } as any)
        .eq("id", viajeActivo.id);
      if (error) throw error;
      await loadViajes();
      toast.success(`✅ Viaje #${viajeActivo.numero_viaje} (${dirActiva}) contabilizado`);
    } catch (err: any) {
      toast.error(err.message || "Error al finalizar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 1500);
    }
  };

  const confirmarFinManual = async () => {
    if (!viajeActivo || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Intentar capturar coordenadas en el momento del cierre.
      // Si hay coordenadas → sí había GPS (fin_manual=false). Si no → realmente sin GPS (fin_manual=true).
      const lat = currentPos?.lat ?? null;
      const lng = currentPos?.lng ?? null;
      const huboGPS = lat != null && lng != null;
      const { error } = await supabase
        .from("viajes_realizados")
        .update({
          fin_lat: lat,
          fin_lng: lng,
          fin_at: new Date().toISOString(),
          estado: "completado",
          fin_manual: !huboGPS,
        } as any)
        .eq("id", viajeActivo.id);
      if (error) throw error;
      await loadViajes();
      toast.success(
        huboGPS
          ? `✅ Viaje #${viajeActivo.numero_viaje} (${dirActiva}) cerrado con GPS`
          : `✅ Viaje #${viajeActivo.numero_viaje} (${dirActiva}) cerrado sin GPS (manual)`
      );
      setManualEndOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al cerrar viaje");
    } finally {
      setTimeout(() => { inFlightRef.current = false; }, 1500);
    }
  };

  const completados = viajesHoy.filter(v => v.estado === "completado").length;
  const noGPS = !!gpsError || !currentPos;

  // Texto de estado superior
  let statusLabel = "Esperando GPS…";
  let statusColor = "text-muted-foreground";
  if (gpsError) {
    statusLabel = `Sin señal GPS — puedes registrar el viaje manualmente`;
    statusColor = "text-destructive";
  } else if (!hasGeofences) {
    statusLabel = "El concesionario no ha definido los puntos A y B en el contrato";
    statusColor = "text-destructive";
  } else if (currentPos) {
    if (viajeActivo) {
      statusLabel = insideEnd
        ? `🏁 Dentro del punto ${dirActiva === "BA" ? "A" : "B"} — confirma fin del viaje`
        : `🏁 Faltan ${Math.round(distEnd!)} m al punto ${dirActiva === "BA" ? "A" : "B"}`;
      statusColor = insideEnd ? "text-primary" : "text-muted-foreground";
    } else if (insideA) {
      statusLabel = `📍 Dentro del Punto A — listo para iniciar AB`;
      statusColor = "text-primary";
    } else if (insideB) {
      statusLabel = `📍 Dentro del Punto B — listo para iniciar BA`;
      statusColor = "text-primary";
    } else {
      const cercaA = distA != null ? `${Math.round(distA)} m a A` : "—";
      const cercaB = distB != null ? `${Math.round(distB)} m a B` : "—";
      statusLabel = `Fuera de geocercas (${cercaA} · ${cercaB})`;
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BackButton />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">Viajes con confirmación</h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {empresaNombre || "Contrato privado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viajeActivo && (
              <Badge variant="outline" className="text-xs gap-1">
                <Radar className="h-3 w-3" /> {dirActiva}
                {viajeActivo.inicio_manual ? " · m" : ""}
              </Badge>
            )}
            {autoMode && hasGeofences && !jornadaActiva && !viajeActivo && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                disabled={inFlightRef.current}
                onClick={() => setAskStartPoint(true)}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Iniciar jornada
              </Button>
            )}
            {autoMode && jornadaActiva && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                disabled={inFlightRef.current}
                onClick={async () => {
                  if (viajeActivo) {
                    const lat = currentPos?.lat ?? null;
                    const lng = currentPos?.lng ?? null;
                    inFlightRef.current = true;
                    try {
                      await supabase
                        .from("viajes_realizados")
                        .update({
                          fin_lat: lat, fin_lng: lng,
                          fin_at: new Date().toISOString(),
                          estado: "completado",
                          fin_manual: lat == null,
                        } as any)
                        .eq("id", viajeActivo.id);
                    } finally {
                      setTimeout(() => { inFlightRef.current = false; }, 1000);
                    }
                  }
                  try {
                    localStorage.removeItem(jornadaKey);
                    localStorage.removeItem(jornadaDateKey);
                    localStorage.removeItem(lastFenceKey);
                    localStorage.removeItem(lastFenceDateKey);
                    localStorage.removeItem(lastActionAtKey);
                  } catch {}
                  setJornadaActiva(false);
                  setLastClosedFence(null);
                  setLastActionAt(0);
                  toast.success("🏁 Jornada finalizada");
                }}
              >
                <Flag className="h-3.5 w-3.5 mr-1" />
                Finalizar jornada
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="shrink-0 h-[35vh] border-b border-border">
        <DriverMiniMap
          routeProductId={routeProductId}
          origenLat={origenLat}
          origenLng={origenLng}
          destinoLat={destinoLat}
          destinoLng={destinoLng}
        />
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
                {viajeActivo ? `En curso (${dirActiva})` : `Sin viaje activo`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Conteo de pasajeros en tiempo real (ESP32) */}
        {viajeActivo && (
          <Card className="border-emerald-400/30 bg-emerald-500/5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Pasajeros · Viaje #{viajeActivo.numero_viaje}
                </p>
                <span className="text-[10px] text-muted-foreground">en vivo</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-background/60 p-2">
                  <p className="text-2xl font-bold text-emerald-600">
                    {viajeActivo.pasajeros_subidos ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Suben</p>
                </div>
                <div className="rounded-lg bg-background/60 p-2">
                  <p className="text-2xl font-bold text-orange-500">
                    {viajeActivo.pasajeros_bajados ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Bajan</p>
                </div>
                <div className="rounded-lg bg-background/60 p-2">
                  <p className="text-2xl font-bold text-primary">
                    {viajeActivo.pasajeros_a_bordo ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">A bordo</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Acumulado del día */}
        {viajesHoy.length > 0 && (
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pasajeros hoy</p>
                <p className="text-xs text-muted-foreground">Suma de todos los viajes</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {viajesHoy.reduce((acc, v) => acc + (v.pasajeros_subidos ?? 0), 0)}
              </p>
            </CardContent>
          </Card>
        )}



        {/* Estado */}
        <Card className={(viajeActivo && insideEnd) || (!viajeActivo && (insideA || insideB)) ? "border-primary/40 bg-primary/5" : ""}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className={`h-4 w-4 ${statusColor}`} />
              <p className={`text-sm font-medium ${statusColor}`}>{statusLabel}</p>
            </div>
            {hasGeofences && (
              <p className="text-[11px] text-muted-foreground pl-6">
                Radio configurado por el concesionario: <strong>{radioM} m</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Botones según estado */}
        {autoMode ? (
          <div className="space-y-2">
            {!jornadaActiva && !viajeActivo && hasGeofences && (
              <p className="text-[11px] text-center text-muted-foreground">
                Inicia la jornada desde el botón en la esquina superior derecha. Después del primer viaje, los siguientes se cuentan solos.
              </p>
            )}
            {!hasGeofences && (
              <p className="text-xs text-center text-destructive">
                Pide al concesionario marcar el Punto A y el Punto B en la ruta.
              </p>
            )}
          </div>
        ) : (

          <>
            {hasGeofences && !viajeActivo && (
              <div className="space-y-2">
                <Button
                  size="lg"
                  className="w-full h-14 text-base"
                  onClick={() => setAskDir(true)}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Iniciar nuevo viaje
                </Button>
              </div>
            )}

            {hasGeofences && viajeActivo && (
              <div className="space-y-2">
                <Button
                  size="lg"
                  className="w-full h-14 text-base"
                  disabled={!currentPos || !insideEnd || inFlightRef.current}
                  onClick={confirmarFinGPS}
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  {insideEnd
                    ? `Confirmar llegada (${dirActiva})`
                    : currentPos && distEnd != null
                      ? `Acércate al punto ${dirActiva === "BA" ? "A" : "B"} (faltan ${Math.round(distEnd)} m)`
                      : `Esperando ubicación…`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setManualEndOpen(true)}
                >
                  <WifiOff className="h-4 w-4 mr-2" />
                  Cerrar viaje manualmente (sin GPS)
                </Button>
              </div>
            )}
          </>
        )}


        {!hasGeofences && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Pide al concesionario que abra el contrato y marque en el mapa el Punto A (inicio) y el Punto B (centro de trabajo).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actualización silenciosa en segundo plano */}

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
                    <span className="font-medium">
                      Viaje #{v.numero_viaje}
                      {v.direccion && <span className="ml-2 text-muted-foreground">({v.direccion})</span>}
                      {(v.inicio_manual || v.fin_manual) && (
                        <Badge variant="outline" className="ml-2 text-[9px] py-0">manual</Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold whitespace-nowrap">
                        <span className="text-emerald-500">↑{v.pasajeros_subidos ?? 0}</span>
                        <span className="text-orange-500 ml-1">↓{v.pasajeros_bajados ?? 0}</span>
                      </span>
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

      {/* Diálogo: elegir dirección AB / BA */}
      <AlertDialog open={askDir} onOpenChange={setAskDir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Qué viaje vas a iniciar?</AlertDialogTitle>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <Button
              size="lg"
              className="h-20 flex flex-col"
              variant={insideA ? "default" : "outline"}
              onClick={() => {
                if (noGPS) { setAskDir(false); setManualStartDir("AB"); return; }
                if (!insideA) {
                  toast.error(
                    `Estás a ${distA != null ? Math.round(distA) + " m" : "—"} de distancia. Acércate a ${radioM} m del Punto A para iniciar tu viaje AB.`,
                    { duration: 5000 }
                  );
                  return;
                }
                confirmarInicioGPS("AB").then(() => setAskDir(false));
              }}
            >
              <span className="text-lg font-bold">AB</span>
              <span className="text-[10px] opacity-80">A → B</span>
              {!noGPS && (
                <span className="text-[10px] opacity-80">
                  {insideA ? "✓ Dentro de A" : distA != null ? `${Math.round(distA)} m a A` : "—"}
                </span>
              )}
            </Button>
            <Button
              size="lg"
              className="h-20 flex flex-col"
              variant={insideB ? "default" : "outline"}
              onClick={() => {
                if (noGPS) { setAskDir(false); setManualStartDir("BA"); return; }
                if (!insideB) {
                  toast.error(
                    `Estás a ${distB != null ? Math.round(distB) + " m" : "—"} de distancia. Acércate a ${radioM} m del Punto B para iniciar tu viaje BA.`,
                    { duration: 5000 }
                  );
                  return;
                }
                confirmarInicioGPS("BA").then(() => setAskDir(false));
              }}
            >
              <span className="text-lg font-bold">BA</span>
              <span className="text-[10px] opacity-80">B → A</span>
              {!noGPS && (
                <span className="text-[10px] opacity-80">
                  {insideB ? "✓ Dentro de B" : distB != null ? `${Math.round(distB)} m a B` : "—"}
                </span>
              )}
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: confirmar inicio manual (sin GPS o fuera de geocerca) */}
      <AlertDialog open={!!manualStartDir} onOpenChange={(o) => !o && setManualStartDir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <WifiOff className="h-4 w-4" /> Iniciar viaje {manualStartDir} sin verificación GPS
            </AlertDialogTitle>
            <AlertDialogDescription>
              {gpsError
                ? "No tenemos señal GPS en este momento."
                : "Estás fuera de la geocerca, pero puedes declarar el inicio del viaje."}
              <br />
              Quedará registrado como <strong>manual</strong> en el reporte. Confirma que estás físicamente en el
              Punto <strong>{manualStartDir === "AB" ? "A (inicio de ruta)" : "B (centro de trabajo)"}</strong> y vas a salir hacia
              el Punto <strong>{manualStartDir === "AB" ? "B" : "A"}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => manualStartDir && confirmarInicioManual(manualStartDir)}>
              Sí, registrar inicio manual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: cerrar viaje manualmente */}
      <AlertDialog open={manualEndOpen} onOpenChange={setManualEndOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto w-[95vw] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>Cerrar viaje sin verificación de geocerca</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2">
              <span className="block">Confirma que ya llegaste al Punto <strong>{dirActiva === "BA" ? "A" : "B"}</strong>.</span>
              <span className="block">Al confirmar, el sistema intentará capturar tu ubicación actual:</span>
              <span className="block">• Si <strong>obtiene coordenadas</strong>, el cierre se marcará <strong>con GPS</strong>.</span>
              <span className="block">• Si <strong>no hay señal GPS</strong>, quedará como <strong>manual</strong> en el reporte del concesionario.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={confirmarFinManual} className="w-full">Sí, cerrar viaje</AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: punto de inicio de jornada (auto mode) */}
      <AlertDialog open={askStartPoint} onOpenChange={setAskStartPoint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desde dónde inicias tu jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              Elige tu punto de partida. A partir del próximo viaje, todo se cuenta solo al entrar a cada geocerca.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-1 gap-2 py-2">
            <Button
              size="lg"
              className="h-16 justify-start"
              variant={insideA ? "default" : "outline"}
              disabled={inFlightRef.current}
              onClick={() => startJornadaFrom("A")}
            >
              <MapPin className="h-5 w-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="text-base font-bold">Punto A → voy a B</span>
                <span className="text-[11px] opacity-80">
                  {insideA ? "✓ Estás dentro de A" : distA != null ? `Estás a ${Math.round(distA)} m de A (manual)` : "Sin GPS (manual)"}
                </span>
              </div>
            </Button>

            <Button
              size="lg"
              className="h-16 justify-start"
              variant={insideB ? "default" : "outline"}
              disabled={inFlightRef.current}
              onClick={() => startJornadaFrom("B")}
            >
              <MapPin className="h-5 w-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="text-base font-bold">Punto B → voy a A</span>
                <span className="text-[11px] opacity-80">
                  {insideB ? "✓ Estás dentro de B" : distB != null ? `Estás a ${Math.round(distB)} m de B (manual)` : "Sin GPS (manual)"}
                </span>
              </div>
            </Button>

            <Button
              size="lg"
              className="h-16 justify-start"
              variant="outline"
              disabled={!currentPos || inFlightRef.current}
              onClick={() => setAskIntermediateEndPoint(true)}
            >
              <Radar className="h-5 w-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="text-base font-bold">Mi ubicación actual</span>
                <span className="text-[11px] opacity-80">
                  {currentPos
                    ? `Se graba aquí y el próximo punto (A o B) cierra el viaje`
                    : "Esperando GPS…"}
                </span>
              </div>
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: primer viaje desde punto intermedio */}
      <AlertDialog open={askIntermediateEndPoint} onOpenChange={setAskIntermediateEndPoint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar desde tu ubicación actual</AlertDialogTitle>
            <AlertDialogDescription>
              Se grabará el viaje desde aquí <strong>sin asignarle dirección aún</strong>.
              La app detectará automáticamente si terminas en el <strong>Punto A</strong> o en el <strong>Punto B</strong>
              y le pondrá el nombre correcto (AB o BA) al cerrar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Button
              size="lg"
              className="h-16 w-full"
              disabled={!currentPos || inFlightRef.current}
              onClick={() => startJornadaFromIntermediate()}
            >
              <Radar className="h-5 w-5 mr-2" />
              <span className="text-base font-bold">Iniciar viaje aquí</span>
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
