import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Undo2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productoId: string;
  filename?: string | null;
  geojson: any;
  onSaved?: () => void;
}

/**
 * Vertex editor for an uploaded LineString trace.
 * - Click a vertex to select it.
 * - Drag a vertex to move it.
 * - "Eliminar vértice" removes the selected one.
 * - Click on the polyline to insert a new vertex at that position.
 */
export default function RouteTraceEditor({ open, onOpenChange, productoId, filename, geojson, onSaved }: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const [coords, setCoords] = useState<[number, number][]>([]); // [lat, lng]
  const [history, setHistory] = useState<[number, number][][]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Extract first LineString
  useEffect(() => {
    if (!open || !geojson) return;
    const line = geojson.features?.find(
      (f: any) => f?.geometry?.type === 'LineString'
    );
    if (!line) {
      toast({ title: 'Sin línea editable', description: 'Esta ruta no tiene un LineString.', variant: 'destructive' });
      return;
    }
    const c = (line.geometry.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
    setCoords(c);
    setHistory([]);
    setSelectedIdx(null);
  }, [open, geojson, toast]);

  // Init map
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current) return;
    const m = L.map(mapElRef.current, { zoomControl: true }).setView([29.0729, -110.9559], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(m);
    mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 100);
    return () => {
      m.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markersGroupRef.current = null;
    };
  }, [open]);

  // Redraw polyline + markers whenever coords change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || coords.length < 2) return;

    if (polylineRef.current) polylineRef.current.remove();
    if (markersGroupRef.current) markersGroupRef.current.remove();

    const poly = L.polyline(coords, { color: '#0066CC', weight: 5, opacity: 0.85 }).addTo(map);
    poly.on('click', (e: L.LeafletMouseEvent) => {
      // Insert a new vertex between the two nearest existing ones
      const { lat, lng } = e.latlng;
      const insertAt = findInsertIndex(coords, [lat, lng]);
      pushHistory();
      const next = [...coords];
      next.splice(insertAt, 0, [lat, lng]);
      setCoords(next);
      setSelectedIdx(insertAt);
    });
    polylineRef.current = poly;

    const group = L.layerGroup().addTo(map);
    coords.forEach(([lat, lng], idx) => {
      const isSelected = idx === selectedIdx;
      const isEndpoint = idx === 0 || idx === coords.length - 1;
      const color = isSelected ? '#dc2626' : isEndpoint ? '#16a34a' : '#0066CC';
      const size = isSelected ? 16 : 10;
      const icon = L.divIcon({
        className: 'route-vertex-marker',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:grab"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(group);
      marker.on('click', () => setSelectedIdx(idx));
      marker.on('dragstart', () => pushHistory());
      marker.on('drag', (e: any) => {
        const ll = e.target.getLatLng();
        // live update polyline
        const next = [...coords];
        next[idx] = [ll.lat, ll.lng];
        if (polylineRef.current) polylineRef.current.setLatLngs(next);
      });
      marker.on('dragend', (e: any) => {
        const ll = e.target.getLatLng();
        const next = [...coords];
        next[idx] = [ll.lat, ll.lng];
        setCoords(next);
        setSelectedIdx(idx);
      });
    });
    markersGroupRef.current = group;

    // Fit only on initial load
    if (history.length === 0) {
      map.fitBounds(poly.getBounds(), { padding: [30, 30] });
    }
  }, [coords, selectedIdx]);

  const pushHistory = () => {
    setHistory((h) => [...h.slice(-49), coords]);
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCoords(prev);
      setSelectedIdx(null);
      return h.slice(0, -1);
    });
  };

  const deleteVertex = () => {
    if (selectedIdx === null) return;
    if (coords.length <= 2) {
      toast({ title: 'No se puede', description: 'Una ruta necesita al menos 2 puntos.', variant: 'destructive' });
      return;
    }
    pushHistory();
    setCoords((c) => c.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const handleSave = async () => {
    if (coords.length < 2) return;
    setSaving(true);
    try {
      // Rebuild GeoJSON: keep non-LineString features (Points/etc), replace first LineString
      const newCoords = coords.map(([lat, lng]) => [lng, lat]);
      let replaced = false;
      const features = (geojson.features || []).map((f: any) => {
        if (!replaced && f?.geometry?.type === 'LineString') {
          replaced = true;
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: newCoords },
            properties: { ...(f.properties || {}), edited: true, editedAt: new Date().toISOString() },
          };
        }
        return f;
      });
      const newGeoJSON = { ...geojson, type: 'FeatureCollection', features };
      const { error } = await (supabase as any).rpc('save_private_route_trace', {
        _producto_id: productoId,
        _filename: filename || 'editado.geojson',
        _geojson: newGeoJSON,
      });
      if (error) throw error;
      toast({ title: '✅ Trazado actualizado', description: `${coords.length} puntos guardados.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Editor de trazado</DialogTitle>
          <DialogDescription className="text-xs">
            Arrastra los puntos azules para moverlos. Toca la línea para insertar un punto. Verde = inicio/fin · Rojo = seleccionado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 px-4 py-2 border-y bg-muted/40">
          <Button size="sm" variant="outline" onClick={undo} disabled={history.length === 0}>
            <Undo2 className="h-3 w-3 mr-1" />Deshacer
          </Button>
          <Button size="sm" variant="outline" onClick={deleteVertex} disabled={selectedIdx === null} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-1" />Eliminar vértice
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {coords.length} puntos {selectedIdx !== null && `· seleccionado #${selectedIdx + 1}`}
          </span>
        </div>
        <div ref={mapElRef} className="flex-1 w-full" style={{ minHeight: 300 }} />
        <DialogFooter className="px-4 pb-4 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || coords.length < 2}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findInsertIndex(coords: [number, number][], point: [number, number]): number {
  // Insert after the segment whose midpoint distance to point is smallest
  let bestIdx = 1;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const d = (mx - point[0]) ** 2 + (my - point[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}
