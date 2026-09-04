import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TRAZA_LABELS } from "@/lib/traza";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Handshake, MapPin, Route, Trash2, Loader2, RefreshCw } from "lucide-react";

interface Punto {
  id: string;
  lat: number;
  lng: number;
  tipo_evento: string;
  receptor_id: string | null;
  receptor_nombre: string | null;
  lugar: string | null;
  ocurrido_en: string;
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Hermosillo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });


const colorPorTipo = (tipo: string) => {
  switch (tipo) {
    case "pago":
      return "#16a34a";
    case "cobro":
      return "#0ea5e9";
    case "asistencia":
      return "#f59e0b";
    case "testigo":
      return "#7c3aed";
    default:
      return "#dc2626";
  }
};

const testigoIcon = L.divIcon({
  className: "testigo-map-marker",
  html: '<span aria-hidden="true">🤝</span>',
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

function AjustarMapa({ puntos }: { puntos: Punto[] }) {
  const map = useMap();

  useEffect(() => {
    if (puntos.length === 0) return;
    const bounds = L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number]));
    if (puntos.length === 1) map.setView(bounds.getCenter(), 16);
    else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    window.setTimeout(() => map.invalidateSize(), 100);
  }, [map, puntos]);

  return null;
}

export default function MiTrazabilidad() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activa, setActiva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [lugar, setLugar] = useState("");
  const [rango, setRango] = useState<"hoy" | "semana" | "mes" | "todo" | "dia" | "custom">("hoy");

  function ymdHermosillo(d: Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Hermosillo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function aplicarRango(r: "hoy" | "semana" | "mes" | "todo") {
    setRango(r);
    const hoy = new Date();
    const hoyStr = ymdHermosillo(hoy);
    if (r === "todo") {
      setDesde("");
      setHasta("");
      return;
    }
    if (r === "hoy") {
      setDesde(hoyStr);
      setHasta(hoyStr);
      return;
    }
    if (r === "semana") {
      const ini = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);
      setDesde(ymdHermosillo(ini));
      setHasta(hoyStr);
      return;
    }
    setDesde(`${hoyStr.slice(0, 8)}01`);
    setHasta(hoyStr);
  }

  useEffect(() => {
    aplicarRango("hoy");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`mi-trazabilidad-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trazabilidad_puntos", filter: `user_id=eq.${user.id}` },
        () => void cargar()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function cargar() {
    if (!user) return;
    setLoading(true);
    setErrorCarga("");
    try {
    const [{ data: prof, error: profError }, { data: pts, error: puntosError }] = await Promise.all([
      supabase.from("profiles").select("trazabilidad_activa").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("trazabilidad_puntos")
        .select("id, lat, lng, tipo_evento, receptor_id, receptor_nombre, lugar, ocurrido_en")
        .eq("user_id", user.id)
        .order("ocurrido_en", { ascending: true }),
    ]);
    if (profError || puntosError) {
      setErrorCarga(puntosError?.message || profError?.message || "No se pudo cargar el mapa.");
    }
    setActiva(!!prof?.trazabilidad_activa);
    setPuntos((pts as Punto[]) || []);
    } catch (e: any) {
      setErrorCarga(e?.message || "No se pudo cargar el mapa.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(v: boolean) {
    if (!user) return;
    setGuardando(true);
    const { error } = await supabase
      .from("profiles")
      .update({ trazabilidad_activa: v })
      .eq("user_id", user.id);
    setGuardando(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setActiva(v);
    toast({
      title: v ? "Trazabilidad activada" : "Trazabilidad desactivada",
      description: v
        ? "Se guardará un punto cada vez que escanees o te escaneen."
        : "Ya no se guardarán nuevos puntos.",
    });
  }

  async function borrarHistorial() {
    if (!user) return;
    const { error } = await supabase.from("trazabilidad_puntos").delete().eq("user_id", user.id);
    if (error) {
      toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" });
      return;
    }
    setPuntos([]);
    toast({ title: "Historial borrado", description: "Tus puntos fueron eliminados." });
  }

  const filtrados = useMemo(() => {
    return puntos.filter((p) => {
      const t = new Date(p.ocurrido_en).getTime();
      if (desde && t < new Date(`${desde}T00:00:00`).getTime()) return false;
      if (hasta && t > new Date(`${hasta}T23:59:59`).getTime()) return false;
      if (lugar) {
        const texto = `${p.lugar || ""} ${p.receptor_nombre || ""}`.toLowerCase();
        if (!texto.includes(lugar.toLowerCase())) return false;
      }
      return true;
    });
  }, [puntos, desde, hasta, lugar]);

  const frecuencias = useMemo(() => {
    const mapa = new Map<string, number>();
    filtrados.forEach((p) => {
      const clave = p.lugar || p.receptor_nombre || "Sin nombre";
      mapa.set(clave, (mapa.get(clave) || 0) + 1);
    });
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

  const linea = filtrados.map((p) => [p.lat, p.lng] as [number, number]);
  const centro: [number, number] = linea.length ? linea[linea.length - 1] : [29.0729, -110.9559];
  const testigos = filtrados.filter((p) => p.tipo_evento === "testigo");
  const [mapaListo, setMapaListo] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMapaListo(true), 150);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main className="container mx-auto px-4 py-6 pb-40 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Route className="h-6 w-6" /> Mi trazabilidad
          </h1>
          <p className="text-muted-foreground text-sm">
            Guarda un punto solo cuando escaneas o te escanean. No hay rastreo continuo.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Trazabilidad</p>
              <p className="text-sm text-muted-foreground">
                Aplica a tu cuenta eje y a todos tus sub QR.
              </p>
            </div>
            <Switch checked={activa} onCheckedChange={toggle} disabled={guardando} />
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {!activa && (
              <Card className="border-primary/40">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  La trazabilidad está apagada: puedes ver tus puntos anteriores, pero no se
                  guardarán nuevos hasta que la enciendas.
                </CardContent>
              </Card>
            )}
            {errorCarga && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-semibold">No se pudieron mostrar tus puntos</p>
                <p className="mt-1">{errorCarga}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void cargar()}>
                  <RefreshCw className="h-4 w-4" /> Volver a cargar
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border bg-card px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Handshake className="h-5 w-5 text-primary" /> Testigos virtuales
              </span>
              <Badge>{testigos.length}</Badge>
            </div>
            <Card className="overflow-hidden">
              <div className="h-[52vh] min-h-[360px] w-full">
                <ErrorBoundary
                  name="MiTrazabilidadMapa"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                      No se pudo dibujar el mapa. Vuelve a entrar a esta pantalla.
                    </div>
                  }
                >
                {mapaListo && (
                <MapContainer key="traza-map" center={centro} zoom={13} className="h-full w-full" scrollWheelZoom>
                  <AjustarMapa puntos={filtrados} />
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {linea.length > 1 && <Polyline positions={linea} pathOptions={{ color: "#dc2626", weight: 3 }} />}
                  {filtrados.map((p) => {
                    const contenido = (
                      <Popup>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{TRAZA_LABELS[p.tipo_evento] || p.tipo_evento}</p>
                          <p>{fmtFecha(p.ocurrido_en)}</p>
                          {p.lugar && <p>{p.lugar}</p>}
                          {p.receptor_nombre && <p>Con: {p.receptor_nombre}</p>}
                          {!p.receptor_nombre && p.receptor_id && <p>QaRd: {p.receptor_id}</p>}
                        </div>
                      </Popup>
                    );

                    return p.tipo_evento === "testigo" ? (
                      <Marker key={p.id} position={[p.lat, p.lng]} icon={testigoIcon}>
                        {contenido}
                      </Marker>
                    ) : (
                      <CircleMarker
                        key={p.id}
                        center={[p.lat, p.lng]}
                        radius={7}
                        pathOptions={{ color: colorPorTipo(p.tipo_evento), fillOpacity: 0.9 }}
                      >
                        {contenido}
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
                )}
                </ErrorBoundary>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={rango === "hoy" ? "default" : "outline"} onClick={() => aplicarRango("hoy")}>
                    Hoy
                  </Button>
                  <Button size="sm" variant={rango === "semana" ? "default" : "outline"} onClick={() => aplicarRango("semana")}>
                    Esta semana
                  </Button>
                  <Button size="sm" variant={rango === "mes" ? "default" : "outline"} onClick={() => aplicarRango("mes")}>
                    Este mes
                  </Button>
                  <Button size="sm" variant={rango === "todo" ? "default" : "outline"} onClick={() => aplicarRango("todo")}>
                    Todo
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="dia">Día específico</Label>
                  <Input
                    id="dia"
                    type="date"
                    value={desde && desde === hasta ? desde : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRango("dia");
                      setDesde(v);
                      setHasta(v);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="desde">Desde</Label>
                  <Input id="desde" type="date" value={desde} onChange={(e) => { setRango("custom"); setDesde(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="hasta">Hasta</Label>
                  <Input id="hasta" type="date" value={hasta} onChange={(e) => { setRango("custom"); setHasta(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="lugar">Lugar o persona</Label>
                  <Input id="lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} />
                </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lugares más visitados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {frecuencias.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aún no hay puntos guardados.</p>
                )}
                {frecuencias.map(([nombre, veces]) => (
                  <div key={nombre} className="flex items-center justify-between border-b last:border-0 py-2">
                    <span className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {nombre}
                    </span>
                    <Badge variant="secondary">{veces}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Puntos ({filtrados.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {[...filtrados].reverse().map((p) => (
                  <div key={p.id} className="text-sm border-b last:border-0 py-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium">
                        {p.tipo_evento === "testigo" && <span aria-hidden="true" className="text-lg">🤝</span>}
                        {TRAZA_LABELS[p.tipo_evento] || p.tipo_evento}
                      </span>
                      <span className="text-muted-foreground">{fmtFecha(p.ocurrido_en)}</span>
                    </div>
                    {(p.lugar || p.receptor_nombre) && (
                      <p className="text-muted-foreground">{p.lugar || p.receptor_nombre}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" /> Borrar mi historial
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar todo tu historial?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán todos tus puntos guardados. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={borrarHistorial}>Borrar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </main>
    </div>
  );
}
