import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { DriverMiniMap } from "@/components/DriverMiniMap";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Square, MapPin, Building2, Loader2 } from "lucide-react";
import { getHermosilloToday } from "@/lib/utils";

interface DriverTripPanelProps {
  choferEmpresaId: string;
  contratoId: string;
  unidadId: string | null;
  routeProductId: string | null;
  empresaNombre?: string;
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

const getCurrentPosition = (): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    });
  });

export function DriverTripPanel({
  choferEmpresaId,
  contratoId,
  unidadId,
  routeProductId,
  empresaNombre,
}: DriverTripPanelProps) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [viajeActivo, setViajeActivo] = useState<Viaje | null>(null);
  const [viajesHoy, setViajesHoy] = useState<Viaje[]>([]);

  const todayStr = getHermosilloToday();

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

  const handleIniciar = async () => {
    setWorking(true);
    try {
      const pos = await getCurrentPosition();
      const lastNum = viajesHoy[0]?.numero_viaje || 0;
      const { error } = await supabase.from("viajes_realizados").insert({
        contrato_id: contratoId,
        chofer_id: choferEmpresaId,
        unidad_id: unidadId,
        numero_viaje: lastNum + 1,
        fecha: todayStr,
        inicio_lat: pos.coords.latitude,
        inicio_lng: pos.coords.longitude,
        inicio_at: new Date().toISOString(),
        estado: "en_curso",
      });
      if (error) throw error;
      toast.success(`Viaje #${lastNum + 1} iniciado`);
    } catch (err: any) {
      toast.error(err.message || "Error al iniciar viaje");
    } finally {
      setWorking(false);
    }
  };

  const handleFinalizar = async () => {
    if (!viajeActivo) return;
    setWorking(true);
    try {
      const pos = await getCurrentPosition();
      const { error } = await supabase
        .from("viajes_realizados")
        .update({
          fin_lat: pos.coords.latitude,
          fin_lng: pos.coords.longitude,
          fin_at: new Date().toISOString(),
          estado: "completado",
        })
        .eq("id", viajeActivo.id);
      if (error) throw error;
      toast.success(`Viaje #${viajeActivo.numero_viaje} completado`);
    } catch (err: any) {
      toast.error(err.message || "Error al finalizar viaje");
    } finally {
      setWorking(false);
    }
  };

  const completados = viajesHoy.filter(v => v.estado === "completado").length;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BackButton />
            <div>
              <h1 className="text-sm font-bold text-foreground">Viajes por contrato</h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {empresaNombre || "Contrato privado"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Cobro por viaje</Badge>
        </div>
      </div>

      {/* Mapa */}
      <div className="shrink-0 h-[45vh] border-b border-border">
        <DriverMiniMap routeProductId={routeProductId} />
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-3xl font-bold text-foreground">{completados}</p>
              <p className="text-[10px] text-muted-foreground">Viajes completados hoy</p>
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

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viajeActivo ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-semibold">Viaje #{viajeActivo.numero_viaje} en curso</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Iniciado: {viajeActivo.inicio_at ? new Date(viajeActivo.inicio_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </p>
              <Button
                onClick={handleFinalizar}
                disabled={working}
                size="lg"
                className="w-full bg-destructive hover:bg-destructive/90"
              >
                {working ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Square className="h-5 w-5 mr-2" />}
                Finalizar viaje
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Presiona el botón para iniciar un nuevo viaje. Se registrará tu ubicación de inicio.
              </p>
              <Button onClick={handleIniciar} disabled={working} size="lg" className="w-full">
                {working ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Play className="h-5 w-5 mr-2" />}
                Iniciar viaje #{(viajesHoy[0]?.numero_viaje || 0) + 1}
              </Button>
            </CardContent>
          </Card>
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
