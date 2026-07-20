import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Crosshair, Save } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadId: string | null;
  unitName?: string;
  onSaved?: () => void;
}

type Coord = { lat: number; lng: number };
type Mode = "A" | "B";

export default function UnidadPuntosABDialog({ open, onOpenChange, unidadId, unitName, onSaved }: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const aMarkerRef = useRef<L.Marker | null>(null);
  const bMarkerRef = useRef<L.Marker | null>(null);
  const aCircleRef = useRef<L.Circle | null>(null);
  const bCircleRef = useRef<L.Circle | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [puntoA, setPuntoA] = useState<Coord | null>(null);
  const [puntoB, setPuntoB] = useState<Coord | null>(null);
  const [radio, setRadio] = useState(150);
  const [mode, setMode] = useState<Mode>("A");

  const stateRef = useRef({ puntoA, puntoB, radio, mode });
  stateRef.current = { puntoA, puntoB, radio, mode };

  // Cargar datos existentes
  useEffect(() => {
    if (!open || !unidadId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("unidades_empresa")
          .select("punto_a_lat, punto_a_lng, punto_b_lat, punto_b_lng, geofence_radius_m")
          .eq("id", unidadId)
          .maybeSingle();
        if (error) throw error;
        const d = data as any;
        setPuntoA(d?.punto_a_lat != null ? { lat: Number(d.punto_a_lat), lng: Number(d.punto_a_lng) } : null);
        setPuntoB(d?.punto_b_lat != null ? { lat: Number(d.punto_b_lat), lng: Number(d.punto_b_lng) } : null);
        setRadio(d?.geofence_radius_m || 150);
        setMode(d?.punto_a_lat == null ? "A" : d?.punto_b_lat == null ? "B" : "A");
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, unidadId, toast]);

  // Inicializar mapa
  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;
    // Pequeño delay para asegurar que el contenedor tenga tamaño
    const t = setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [23.6345, -102.5528], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      if (navigator.geolocation && !stateRef.current.puntoA && !stateRef.current.puntoB) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const s = stateRef.current;
            if (!s.puntoA && !s.puntoB && mapRef.current) {
              try { mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 13); } catch {}
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      }

      map.on("click", (e: L.LeafletMouseEvent) => {
        const point = { lat: e.latlng.lat, lng: e.latlng.lng };
        const s = stateRef.current;
        if (s.mode === "A") {
          setPuntoA(point);
          setMode("B");
        } else {
          setPuntoB(point);
        }
      });
    }, 100);
    return () => {
      clearTimeout(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        aMarkerRef.current = null;
        bMarkerRef.current = null;
        aCircleRef.current = null;
        bCircleRef.current = null;
      }
    };
  }, [open]);

  // Dibujar marcadores
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = (
      coord: Coord | null,
      markerRef: React.MutableRefObject<L.Marker | null>,
      circleRef: React.MutableRefObject<L.Circle | null>,
      color: string,
      emoji: string,
    ) => {
      if (!coord) {
        if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
        if (circleRef.current) { map.removeLayer(circleRef.current); circleRef.current = null; }
        return;
      }
      const latlng: L.LatLngExpression = [coord.lat, coord.lng];
      if (markerRef.current) markerRef.current.setLatLng(latlng);
      else {
        markerRef.current = L.marker(latlng, {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:28px;line-height:1">${emoji}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
          }),
        }).addTo(map);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(radio);
      } else {
        circleRef.current = L.circle(latlng, { radius: radio, color, weight: 2, fillOpacity: 0.15 }).addTo(map);
      }
    };

    draw(puntoA, aMarkerRef, aCircleRef, "#16a34a", "🅰️");
    draw(puntoB, bMarkerRef, bCircleRef, "#2563eb", "🅱️");

    if (puntoA && puntoB) {
      map.fitBounds(L.latLngBounds([[puntoA.lat, puntoA.lng], [puntoB.lat, puntoB.lng]]), { padding: [40, 40] });
    } else if (puntoA) map.setView([puntoA.lat, puntoA.lng], 14);
    else if (puntoB) map.setView([puntoB.lat, puntoB.lng], 14);
  }, [puntoA, puntoB, radio]);

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mode === "A") { setPuntoA(point); setMode("B"); }
        else setPuntoB(point);
        mapRef.current?.setView([point.lat, point.lng], 15);
      },
      () => toast({ title: "Sin GPS", description: "No pudimos obtener tu ubicación", variant: "destructive" }),
    );
  };

  const handleSave = async () => {
    if (!unidadId) return;
    if (!puntoA || !puntoB) {
      toast({ title: "Faltan puntos", description: "Marca los dos puntos A y B en el mapa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("rpc_unidad_set_puntos_ab", {
        _unidad_id: unidadId,
        _a_lat: puntoA.lat,
        _a_lng: puntoA.lng,
        _b_lat: puntoB.lat,
        _b_lng: puntoB.lng,
        _radio: radio,
      });
      if (error) throw error;
      toast({ title: "Guardado", description: "Los puntos A y B quedaron configurados" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Puntos A y B
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : "Conteo automático de viajes"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cada vez que la unidad llegue al círculo A o B, el sistema cierra el viaje en curso (con su número de pasajeros) y abre el siguiente. El chofer no necesita tocar nada.
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "A" ? "default" : "outline"}
                onClick={() => setMode("A")}
                className="flex-1"
              >
                🅰️ Punto A {puntoA ? "✓" : ""}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "B" ? "default" : "outline"}
                onClick={() => setMode("B")}
                className="flex-1"
              >
                🅱️ Punto B {puntoB ? "✓" : ""}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={useMyLocation} title="Usar mi ubicación">
                <Crosshair className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Toca el mapa para fijar el {mode === "A" ? "punto A (terminal/origen)" : "punto B (terminal/destino)"}.
            </p>

            <div ref={containerRef} className="w-full h-72 rounded-md border border-border overflow-hidden" />

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Radio (m):</label>
              <Input
                type="number"
                min={50}
                max={99999}
                value={radio}
                onChange={(e) => setRadio(Math.max(50, Math.min(99999, parseInt(e.target.value) || 150)))}
                className="h-8 w-24"
              />
              <span className="text-[11px] text-muted-foreground">50–99,999 m. Recomendado 150 m.</span>
            </div>

            <Button onClick={handleSave} disabled={saving || !puntoA || !puntoB} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar puntos
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
