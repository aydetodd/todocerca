import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Flag, Crosshair, Loader2, Save, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Coord { lat: number; lng: number }

interface Props {
  productoId: string;
  initial: {
    origin: Coord | null;
    destination: Coord | null;
    radius: number;
  };
  onSaved?: (next: { origin: Coord; destination: Coord; radius: number }) => void;
}

type Mode = "origen" | "destino";

export function RouteEndpointsPicker({ productoId, initial, onSaved }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const originCircleRef = useRef<L.Circle | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const destCircleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const lastViewRef = useRef<{ center: L.LatLngExpression; zoom: number } | null>(null);

  const [mode, setMode] = useState<Mode>(initial.origin ? (initial.destination ? "origen" : "destino") : "origen");
  const [origin, setOrigin] = useState<Coord | null>(initial.origin);
  const [destination, setDestination] = useState<Coord | null>(initial.destination);
  const [radius, setRadius] = useState<number>(initial.radius || 50);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const [mapReadyId, setMapReadyId] = useState(0);

  const setMapContainerRef = useCallback((node: HTMLDivElement | null) => {
    setMapContainer(node);
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainer) return;
    if ((mapContainer as any)._leaflet_id) delete (mapContainer as any)._leaflet_id;
    const startCenter: L.LatLngExpression = lastViewRef.current?.center || (origin
      ? [origin.lat, origin.lng]
      : destination
      ? [destination.lat, destination.lng]
      : [29.0729, -110.9559]);
    const startZoom = lastViewRef.current?.zoom || (origin || destination ? 14 : 12);
    const map = L.map(mapContainer, { center: startCenter, zoom: startZoom, attributionControl: false });
    const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(map);
    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    setMapReadyId((v) => v + 1);

    const refresh = () => {
      map.invalidateSize(false);
      tileLayer.redraw();
    };
    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });
    const timer = window.setTimeout(refresh, 300);

    return () => {
      window.clearTimeout(timer);
      lastViewRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      tileLayerRef.current = null;
      originMarkerRef.current = null;
      originCircleRef.current = null;
      destMarkerRef.current = null;
      destCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapContainer]);

  useEffect(() => {
    if (!expanded) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [expanded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const refresh = () => {
      map.invalidateSize(false);
      tileLayerRef.current?.redraw();
    };
    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });
    const timers = [150, 400, 800].map((delay) => window.setTimeout(refresh, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [expanded, mapReadyId]);

  // Draw markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = (
      coord: Coord | null,
      mRef: React.MutableRefObject<L.Marker | null>,
      cRef: React.MutableRefObject<L.Circle | null>,
      color: string,
      emoji: string
    ) => {
      if (!coord) {
        if (mRef.current) { map.removeLayer(mRef.current); mRef.current = null; }
        if (cRef.current) { map.removeLayer(cRef.current); cRef.current = null; }
        return;
      }
      const ll: L.LatLngExpression = [coord.lat, coord.lng];
      if (mRef.current) mRef.current.setLatLng(ll);
      else mRef.current = L.marker(ll, {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:28px;line-height:1">${emoji}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 28],
        }),
      }).addTo(map);
      if (cRef.current) { cRef.current.setLatLng(ll); cRef.current.setRadius(radius); }
      else cRef.current = L.circle(ll, { radius, color, weight: 2, fillOpacity: 0.15 }).addTo(map);
    };

    draw(origin, originMarkerRef, originCircleRef, "#16a34a", "🚏");
    draw(destination, destMarkerRef, destCircleRef, "#2563eb", "🏁");
  }, [origin, destination, radius, mapReadyId]);

  const fixHere = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const point = { lat: c.lat, lng: c.lng };
    if (mode === "origen") {
      setOrigin(point);
      setMode("destino");
    } else {
      setDestination(point);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16),
      () => toast({ title: "No pude obtener tu ubicación", variant: "destructive" })
    );
  };

  const handleSave = async () => {
    if (!origin || !destination) {
      toast({ title: "Faltan puntos", description: "Fija inicio y final antes de guardar." });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("save_route_endpoints", {
        _producto_id: productoId,
        _origin_lat: origin.lat,
        _origin_lng: origin.lng,
        _destination_lat: destination.lat,
        _destination_lng: destination.lng,
        _radius_m: radius,
      });
      if (error) throw error;
      toast({ title: "Puntos guardados", description: "Inicio y final de la ruta actualizados." });
      onSaved?.({ origin, destination, radius });
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant={mode === "origen" ? "default" : "outline"} onClick={() => setMode("origen")} className="flex-1">
          <MapPin className="h-4 w-4 mr-1" /> Inicio {origin ? "✓" : ""}
        </Button>
        <Button type="button" size="sm" variant={mode === "destino" ? "default" : "outline"} onClick={() => setMode("destino")} className="flex-1">
          <Flag className="h-4 w-4 mr-1" /> Final {destination ? "✓" : ""}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={useMyLocation} title="Centrar en mi ubicación">
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Mueve el mapa para que el centro quede sobre el punto de {mode === "origen" ? "inicio (🚏)" : "final (🏁)"} y presiona "Fijar aquí".
      </p>

      <div className={expanded ? "fixed inset-0 z-[2000] bg-background p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex flex-col gap-2" : "relative"}>
        <div ref={setMapContainerRef} className={expanded ? "min-h-0 flex-1 w-full rounded-md border border-border overflow-hidden" : "w-full h-72 rounded-md border border-border overflow-hidden"} />
        {/* Crosshair overlay */}
        <div className={expanded ? "pointer-events-none absolute left-3 right-3 top-3 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-[400] flex items-center justify-center" : "pointer-events-none absolute inset-0 z-[400] flex items-center justify-center"}>
          <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-foreground/70" />
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-foreground/70" />
          <div className="h-3 w-3 rounded-full border-2 border-foreground bg-background/80 shadow" />
        </div>
        {/* Expand/Collapse button */}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute top-2 right-2 z-[500] h-8 w-8 shadow-lg"
          onClick={() => {
            setExpanded((v) => !v);
          }}
          title={expanded ? "Reducir mapa" : "Expandir mapa"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        {expanded && (
          <Button type="button" onClick={fixHere} className="w-full">
            Fijar aquí ({mode === "origen" ? "Inicio" : "Final"})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={fixHere} className="flex-1">
          Fijar aquí ({mode === "origen" ? "Inicio" : "Final"})
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Radio (m):</Label>
        <Input
          type="number"
          min={50}
          max={1000}
          value={radius}
          onChange={(e) => setRadius(Math.max(50, Math.min(1000, parseInt(e.target.value) || 50)))}
          className="h-8 w-24"
        />
        <span className="text-[11px] text-muted-foreground">Geocerca de detección.</span>
      </div>

      <Button type="button" onClick={handleSave} disabled={saving || !origin || !destination} className="w-full">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : <><Save className="h-4 w-4 mr-2" /> Guardar inicio y final</>}
      </Button>
    </div>
  );
}
