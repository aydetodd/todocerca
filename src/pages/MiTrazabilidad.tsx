import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from "react-leaflet";
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
import { MapPin, Route, Trash2, Loader2 } from "lucide-react";

interface Punto {
  id: string;
  lat: number;
  lng: number;
  tipo_evento: string;
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

export default function MiTrazabilidad() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activa, setActiva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [lugar, setLugar] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function cargar() {
    if (!user) return;
    setLoading(true);
    const [{ data: prof }, { data: pts }] = await Promise.all([
      supabase.from("profiles").select("trazabilidad_activa").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("trazabilidad_puntos")
        .select("id, lat, lng, tipo_evento, receptor_nombre, lugar, ocurrido_en")
        .eq("user_id", user.id)
        .order("ocurrido_en", { ascending: true }),
    ]);
    setActiva(!!prof?.trazabilidad_activa);
    setPuntos((pts as Punto[]) || []);
    setLoading(false);
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtros</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="desde">Desde</Label>
                  <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="hasta">Hasta</Label>
                  <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="lugar">Lugar o persona</Label>
                  <Input id="lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-80 w-full">
                <MapContainer center={centro} zoom={13} className="h-full w-full" scrollWheelZoom>
                  <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {linea.length > 1 && <Polyline positions={linea} pathOptions={{ color: "#dc2626", weight: 3 }} />}
                  {filtrados.map((p) => (
                    <CircleMarker
                      key={p.id}
                      center={[p.lat, p.lng]}
                      radius={7}
                      pathOptions={{ color: colorPorTipo(p.tipo_evento), fillOpacity: 0.9 }}
                    >
                      <Popup>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{TRAZA_LABELS[p.tipo_evento] || p.tipo_evento}</p>
                          <p>{fmtFecha(p.ocurrido_en)}</p>
                          {p.lugar && <p>{p.lugar}</p>}
                          {p.receptor_nombre && <p>Con: {p.receptor_nombre}</p>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
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
                      <span className="font-medium">{TRAZA_LABELS[p.tipo_evento] || p.tipo_evento}</span>
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
