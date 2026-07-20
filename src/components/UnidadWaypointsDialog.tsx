import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, MapPin, Crosshair, Save, Plus, Trash2, ArrowUp, ArrowDown,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadId: string | null;
  unitName?: string;
  onSaved?: () => void;
}

interface Waypoint {
  label: string;
  lat: number;
  lng: number;
  radio_m: number;
}

const COLORS = ["#16a34a", "#2563eb", "#dc2626", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const letra = (i: number) => String.fromCharCode(65 + i); // 0->A, 1->B, ...

export default function UnidadWaypointsDialog({
  open, onOpenChange, unidadId, unitName, onSaved,
}: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const editingIdxRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viajeTipo, setViajeTipo] = useState<"sencillo" | "redondo">("sencillo");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  useEffect(() => { editingIdxRef.current = editingIdx; }, [editingIdx]);

  // Cargar
  useEffect(() => {
    if (!open || !unidadId) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: u }, { data: wps }] = await Promise.all([
          (supabase as any).from("unidades_empresa").select("viaje_tipo").eq("id", unidadId).maybeSingle(),
          (supabase as any).from("unidad_viaje_waypoints")
            .select("orden, label, lat, lng, radio_m")
            .eq("unidad_id", unidadId).order("orden"),
        ]);
        setViajeTipo(((u as any)?.viaje_tipo === "redondo" ? "redondo" : "sencillo"));
        const list: Waypoint[] = (wps || []).map((w: any) => ({
          label: w.label || "",
          lat: Number(w.lat),
          lng: Number(w.lng),
          radio_m: Number(w.radio_m || 150),
        }));
        setWaypoints(list.length > 0 ? list : [
          { label: "A - Origen", lat: 0, lng: 0, radio_m: 150 },
          { label: "B - Destino", lat: 0, lng: 0, radio_m: 150 },
        ]);
        setEditingIdx(list.length > 0 ? null : 0);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, unidadId, toast]);

  // Init mapa
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [23.6345, -102.5528], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      // Centrar en la ubicación actual del usuario si no hay puntos aún
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const hasPoints = waypoints.some((w) => w.lat !== 0 || w.lng !== 0);
            if (!hasPoints && mapRef.current) {
              try { mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 13); } catch {}
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      }
      map.on("click", (e: L.LeafletMouseEvent) => {
        const idx = editingIdxRef.current;
        if (idx == null) return;
        setWaypoints((prev) => {
          const next = [...prev];
          if (!next[idx]) return prev;
          next[idx] = { ...next[idx], lat: e.latlng.lat, lng: e.latlng.lng };
          return next;
        });
      });
    }, 100);
    return () => {
      clearTimeout(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = [];
        polylineRef.current = null;
      }
    };
  }, [open]);

  // Dibujar puntos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];
    if (polylineRef.current) { map.removeLayer(polylineRef.current); polylineRef.current = null; }

    const placed = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);
    placed.forEach((w, i) => {
      const idx = waypoints.indexOf(w);
      const color = COLORS[idx % COLORS.length];
      const marker = L.marker([w.lat, w.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:${color};color:#fff;font-weight:700;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${letra(idx)}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }),
      }).addTo(map);
      const circle = L.circle([w.lat, w.lng], {
        radius: w.radio_m, color, weight: 2, fillOpacity: 0.12,
      }).addTo(map);
      layersRef.current.push(marker, circle);
    });

    if (placed.length >= 2) {
      polylineRef.current = L.polyline(
        placed.map((w) => [w.lat, w.lng] as L.LatLngExpression),
        { color: "#6b7280", weight: 2, dashArray: "6 6" },
      ).addTo(map);
      map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
    } else if (placed.length === 1) {
      map.setView([placed[0].lat, placed[0].lng], 14);
    }
  }, [waypoints]);

  const addWaypoint = () => {
    setWaypoints((prev) => {
      const next = [...prev, { label: `Punto ${letra(prev.length)}`, lat: 0, lng: 0, radio_m: 150 }];
      setEditingIdx(next.length - 1);
      return next;
    });
  };

  const removeWaypoint = (idx: number) => {
    if (waypoints.length <= 2) {
      toast({ title: "Mínimo 2 puntos", description: "Necesitas al menos A y B", variant: "destructive" });
      return;
    }
    setWaypoints((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= waypoints.length) return;
    setWaypoints((prev) => {
      const n = [...prev];
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
  };

  const useMyLocation = () => {
    const idx = editingIdx;
    if (idx == null) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWaypoints((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], lat: pos.coords.latitude, lng: pos.coords.longitude };
          return next;
        });
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
      },
      () => toast({ title: "Sin GPS", variant: "destructive" }),
    );
  };

  const handleSave = async () => {
    if (!unidadId) return;
    const pendientes = waypoints.filter((w) => w.lat === 0 && w.lng === 0);
    if (pendientes.length > 0) {
      toast({ title: "Puntos sin ubicar", description: "Toca el mapa para colocar cada punto", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("rpc_unidad_set_waypoints", {
        _unidad_id: unidadId,
        _viaje_tipo: viajeTipo,
        _waypoints: waypoints.map((w, i) => ({
          label: w.label || `Punto ${letra(i)}`,
          lat: w.lat, lng: w.lng, radio_m: w.radio_m,
        })),
      });
      if (error) throw error;
      toast({ title: "Guardado", description: `${waypoints.length} puntos configurados` });
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
      <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Puntos del viaje
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : "Secuencia de paradas para el conteo automático"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                type="button" size="sm"
                variant={viajeTipo === "sencillo" ? "default" : "outline"}
                onClick={() => setViajeTipo("sencillo")}
                className="flex-1"
              >Sencillo (A → B)</Button>
              <Button
                type="button" size="sm"
                variant={viajeTipo === "redondo" ? "default" : "outline"}
                onClick={() => setViajeTipo("redondo")}
                className="flex-1"
              >Redondo (A → B → …)</Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              El viaje se cierra al llegar al <strong>último</strong> punto y arranca uno nuevo desde el <strong>A</strong>. Puedes agregar los puntos intermedios (C, D, E…) que necesites.
            </p>

            <div ref={containerRef} className="w-full h-56 rounded-md border border-border overflow-hidden" />

            <div className="space-y-2">
              {waypoints.map((w, idx) => {
                const color = COLORS[idx % COLORS.length];
                const isEditing = editingIdx === idx;
                const isPlaced = w.lat !== 0 || w.lng !== 0;
                return (
                  <div
                    key={idx}
                    className={`rounded-md border p-2 space-y-2 ${isEditing ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full w-7 h-7 flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: color }}
                      >{letra(idx)}</div>
                      <Input
                        value={w.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          setWaypoints((prev) => {
                            const n = [...prev]; n[idx] = { ...n[idx], label: v }; return n;
                          });
                        }}
                        placeholder={`Etiqueta (Punto ${letra(idx)})`}
                        className="h-8 flex-1"
                      />
                      <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === waypoints.length - 1} title="Bajar">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeWaypoint(idx)} disabled={waypoints.length <= 2} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isEditing ? "default" : "outline"}
                        onClick={() => setEditingIdx(idx)}
                        className="flex-1"
                      >
                        {isPlaced
                          ? `✓ ${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`
                          : "Colocar en mapa"}
                      </Button>
                      {isEditing && (
                        <Button size="sm" variant="ghost" onClick={useMyLocation} title="Usar mi ubicación">
                          <Crosshair className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground">Radio</Label>
                        <Input
                          type="number" min={30} max={100000}
                          value={w.radio_m}
                          onChange={(e) => {
                            const v = Math.max(30, Math.min(100000, parseInt(e.target.value) || 150));
                            setWaypoints((prev) => {
                              const n = [...prev]; n[idx] = { ...n[idx], radio_m: v }; return n;
                            });
                          }}
                          className="h-8 w-20"
                        />
                        <span className="text-[11px] text-muted-foreground">m</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" onClick={addWaypoint} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Agregar punto {letra(waypoints.length)}
            </Button>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar secuencia
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
