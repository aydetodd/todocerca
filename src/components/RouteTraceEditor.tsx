import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Undo2, Trash2, Locate } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import MapSearchBar from '@/components/MapSearchBar';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productoId: string;
  filename?: string | null;
  geojson: any | null; // null = draw-from-scratch mode
  onSaved?: () => void;
  initialCenter?: [number, number]; // [lat, lng] for draw mode
}

/**
 * Vertex editor / drawer for a route LineString.
 * - Draw mode (geojson=null): tap on the map to add points one by one.
 * - Edit mode: click polyline to insert; drag vertices; delete selected.
 */
export default function RouteTraceEditor({ open, onOpenChange, productoId, filename, geojson, onSaved, initialCenter }: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const coordsRef = useRef<[number, number][]>([]);
  const selectedIdxRef = useRef<number | null>(null);
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<[number, number][][]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const isDrawMode = !geojson;
  const { toast } = useToast();

  // Keep refs in sync (so map handlers see latest values)
  useEffect(() => { coordsRef.current = coords; }, [coords]);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  // Load coords from geojson (edit mode) or start empty (draw mode)
  useEffect(() => {
    if (!open) return;
    if (isDrawMode) {
      setCoords([]);
      setHistory([]);
      setSelectedIdx(null);
      return;
    }
    const line = geojson.features?.find((f: any) => f?.geometry?.type === 'LineString');
    if (!line) {
      toast({ title: 'Sin línea editable', description: 'Esta ruta no tiene un LineString.', variant: 'destructive' });
      return;
    }
    const c = (line.geometry.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
    setCoords(c);
    setHistory([]);
    setSelectedIdx(null);
  }, [open, geojson, isDrawMode, toast]);

  // Init map (wait one frame so the Dialog has measured the container)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let m: L.Map | null = null;

    const tryInit = (attempt = 0) => {
      if (cancelled) return;
      const el = mapElRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
        if (attempt < 30) return setTimeout(() => tryInit(attempt + 1), 100);
        return;
      }
      if (mapRef.current) return;
      const center = initialCenter || [29.0729, -110.9559];
      m = L.map(el, { zoomControl: true }).setView(center, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(m);

      m.on('click', (e: L.LeafletMouseEvent) => {
        if (!isDrawMode) return;
        const { lat, lng } = e.latlng;
        pushHistory();
        const next = [...coordsRef.current, [lat, lng] as [number, number]];
        setCoords(next);
        setSelectedIdx(next.length - 1);
      });

      mapRef.current = m;
      // Force a resize once the dialog finishes animating
      requestAnimationFrame(() => m && m.invalidateSize());
      setTimeout(() => m && m.invalidateSize(), 300);

      // Center on the user's location for draw mode
      if (isDrawMode && !initialCenter && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { try { m && m.setView([pos.coords.latitude, pos.coords.longitude], 16); } catch {} },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      }
    };

    tryInit();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      polylineRef.current = null;
      markersGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

    return () => {
      m.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markersGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Redraw polyline + markers whenever coords change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (markersGroupRef.current) { markersGroupRef.current.remove(); markersGroupRef.current = null; }

    if (coords.length >= 2) {
      const poly = L.polyline(coords, { color: '#0066CC', weight: 5, opacity: 0.85 }).addTo(map);
      poly.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const { lat, lng } = e.latlng;
        const insertAt = findInsertIndex(coordsRef.current, [lat, lng]);
        pushHistory();
        const next = [...coordsRef.current];
        next.splice(insertAt, 0, [lat, lng]);
        setCoords(next);
        setSelectedIdx(insertAt);
      });
      polylineRef.current = poly;
    }

    if (coords.length > 0) {
      const group = L.layerGroup().addTo(map);
      coords.forEach(([lat, lng], idx) => {
        const isSelected = idx === selectedIdx;
        const isEndpoint = idx === 0 || idx === coords.length - 1;
        const color = isSelected ? '#dc2626' : isEndpoint ? '#16a34a' : '#0066CC';
        const size = isSelected ? 16 : 12;
        const icon = L.divIcon({
          className: 'route-vertex-marker',
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:grab"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(group);
        marker.on('click', (e: any) => { L.DomEvent.stopPropagation(e); setSelectedIdx(idx); });
        marker.on('dragstart', () => pushHistory());
        marker.on('drag', (e: any) => {
          const ll = e.target.getLatLng();
          const next = [...coordsRef.current];
          next[idx] = [ll.lat, ll.lng];
          if (polylineRef.current) polylineRef.current.setLatLngs(next);
        });
        marker.on('dragend', (e: any) => {
          const ll = e.target.getLatLng();
          const next = [...coordsRef.current];
          next[idx] = [ll.lat, ll.lng];
          setCoords(next);
          setSelectedIdx(idx);
        });
      });
      markersGroupRef.current = group;
    }

    // Fit bounds only on first load in EDIT mode
    if (!isDrawMode && history.length === 0 && polylineRef.current) {
      try { map.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] }); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, selectedIdx]);

  const pushHistory = () => {
    setHistory((h) => [...h.slice(-49), coordsRef.current]);
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
    if (coords.length <= 2 && !isDrawMode) {
      toast({ title: 'No se puede', description: 'Una ruta necesita al menos 2 puntos.', variant: 'destructive' });
      return;
    }
    pushHistory();
    setCoords((c) => c.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const clearAll = () => {
    if (coords.length === 0) return;
    pushHistory();
    setCoords([]);
    setSelectedIdx(null);
  };

  const handleSave = async () => {
    if (coords.length < 2) {
      toast({ title: 'Faltan puntos', description: 'Agrega al menos 2 puntos para guardar.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const newCoords = coords.map(([lat, lng]) => [lng, lat]);

      let newGeoJSON: any;
      if (isDrawMode) {
        newGeoJSON = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { source: 'hand-drawn', createdAt: new Date().toISOString() },
              geometry: { type: 'LineString', coordinates: newCoords },
            },
          ],
        };
      } else {
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
        newGeoJSON = { ...geojson, type: 'FeatureCollection', features };
      }

      const { error } = await (supabase as any).rpc('save_private_route_trace', {
        _producto_id: productoId,
        _filename: filename || (isDrawMode ? 'trazado-a-mano.geojson' : 'editado.geojson'),
        _geojson: newGeoJSON,
      });
      if (error) throw error;
      toast({ title: '✅ Trazado guardado', description: `${coords.length} puntos.` });
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
          <DialogTitle>{isDrawMode ? 'Dibujar trazado' : 'Editor de trazado'}</DialogTitle>
          <DialogDescription className="text-xs">
            {isDrawMode
              ? 'Toca el mapa para ir poniendo los puntos de tu ruta en orden. Verde = inicio/fin. Arrastra los puntos para ajustarlos.'
              : 'Arrastra los puntos azules para moverlos. Toca la línea para insertar un punto. Verde = inicio/fin · Rojo = seleccionado.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-y bg-muted/40">
          <Button size="sm" variant="outline" onClick={undo} disabled={history.length === 0}>
            <Undo2 className="h-3 w-3 mr-1" />Deshacer
          </Button>
          <Button size="sm" variant="outline" onClick={deleteVertex} disabled={selectedIdx === null} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-1" />Eliminar vértice
          </Button>
          {isDrawMode && (
            <Button size="sm" variant="ghost" onClick={clearAll} disabled={coords.length === 0} className="text-destructive">
              Limpiar todo
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {coords.length} puntos {selectedIdx !== null && `· seleccionado #${selectedIdx + 1}`}
          </span>
        </div>
        <div ref={mapElRef} className="flex-1 w-full" style={{ minHeight: 300 }} />
        <DialogFooter className="px-4 pb-4 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || coords.length < 2}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Guardar trazado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findInsertIndex(coords: [number, number][], point: [number, number]): number {
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
