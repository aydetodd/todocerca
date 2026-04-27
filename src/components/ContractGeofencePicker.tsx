import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Building2, Crosshair } from "lucide-react";

interface Coord {
  lat: number;
  lng: number;
}

interface ContractGeofencePickerProps {
  origen: Coord | null;
  destino: Coord | null;
  radio: number;
  onChange: (next: { origen: Coord | null; destino: Coord | null; radio: number }) => void;
}

type Mode = "origen" | "destino";

export function ContractGeofencePicker({ origen, destino, radio, onChange }: ContractGeofencePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const origenMarkerRef = useRef<L.Marker | null>(null);
  const destinoMarkerRef = useRef<L.Marker | null>(null);
  const origenCircleRef = useRef<L.Circle | null>(null);
  const destinoCircleRef = useRef<L.Circle | null>(null);
  const [mode, setMode] = useState<Mode>("origen");
  const stateRef = useRef({ origen, destino, radio, mode });
  stateRef.current = { origen, destino, radio, mode };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [29.0729, -110.9559],
      zoom: 12,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    map.on("click", (e: L.LeafletMouseEvent) => {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };
      const s = stateRef.current;
      if (s.mode === "origen") {
        onChange({ origen: point, destino: s.destino, radio: s.radio });
        setMode("destino");
      } else {
        onChange({ origen: s.origen, destino: point, radio: s.radio });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers + circles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawPoint = (
      coord: Coord | null,
      markerRef: React.MutableRefObject<L.Marker | null>,
      circleRef: React.MutableRefObject<L.Circle | null>,
      color: string,
      emoji: string
    ) => {
      if (!coord) {
        if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
        if (circleRef.current) { map.removeLayer(circleRef.current); circleRef.current = null; }
        return;
      }
      const latlng: L.LatLngExpression = [coord.lat, coord.lng];
      if (markerRef.current) {
        markerRef.current.setLatLng(latlng);
      } else {
        markerRef.current = L.marker(latlng, {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:26px;line-height:1">${emoji}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 26],
          }),
        }).addTo(map);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(radio);
      } else {
        circleRef.current = L.circle(latlng, {
          radius: radio,
          color,
          weight: 2,
          fillOpacity: 0.15,
        }).addTo(map);
      }
    };

    drawPoint(origen, origenMarkerRef, origenCircleRef, "#16a34a", "🚏");
    drawPoint(destino, destinoMarkerRef, destinoCircleRef, "#2563eb", "🏭");

    if (origen && destino) {
      const bounds = L.latLngBounds([
        [origen.lat, origen.lng],
        [destino.lat, destino.lng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (origen) {
      map.setView([origen.lat, origen.lng], 14);
    } else if (destino) {
      map.setView([destino.lat, destino.lng], 14);
    }
  }, [origen, destino, radio]);

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mode === "origen") {
          onChange({ origen: point, destino, radio });
          setMode("destino");
        } else {
          onChange({ origen, destino: point, radio });
        }
        if (mapRef.current) mapRef.current.setView([point.lat, point.lng], 15);
      },
      () => {}
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "origen" ? "default" : "outline"}
          onClick={() => setMode("origen")}
          className="flex-1"
        >
          <MapPin className="h-4 w-4 mr-1" /> Origen {origen ? "✓" : ""}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "destino" ? "default" : "outline"}
          onClick={() => setMode("destino")}
          className="flex-1"
        >
          <Building2 className="h-4 w-4 mr-1" /> Destino {destino ? "✓" : ""}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={useMyLocation} title="Usar mi ubicación">
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Toca el mapa para fijar el {mode === "origen" ? "punto de salida (🚏)" : "punto de llegada / maquiladora (🏭)"}.
      </p>
      <div ref={containerRef} className="w-full h-64 rounded-md border border-border overflow-hidden" />
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Radio (m):</label>
        <Input
          type="number"
          min={50}
          max={1000}
          value={radio}
          onChange={(e) => onChange({ origen, destino, radio: Math.max(50, parseInt(e.target.value) || 150) })}
          className="h-8 w-24"
        />
        <span className="text-[11px] text-muted-foreground">
          Recomendado: 150 m. Se contará el viaje al entrar al destino.
        </span>
      </div>
    </div>
  );
}
