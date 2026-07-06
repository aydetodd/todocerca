import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';
import { parseRouteTraceFile } from '@/lib/routeTraceParser';

interface MaestraFull {
  id: string;
  nombre: string;
  route_geojson: any;
  route_origin_lat: number | null;
  route_origin_lng: number | null;
  route_destination_lat: number | null;
  route_destination_lng: number | null;
  route_geofence_radius_m: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  maestra: MaestraFull | null;
  permisoExpiraAt?: string | null;
  onSaved?: () => void;
}

function extractEndpoints(geojson: any) {
  try {
    const line = geojson?.features?.find((f: any) =>
      f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
    );
    if (!line) return { origin: null, destination: null };
    const coords: number[][] =
      line.geometry.type === 'LineString' ? line.geometry.coordinates : line.geometry.coordinates.flat();
    if (coords.length < 2) return { origin: null, destination: null };
    const [oLng, oLat] = coords[0];
    const [dLng, dLat] = coords[coords.length - 1];
    return { origin: { lat: oLat, lng: oLng }, destination: { lat: dLat, lng: dLng } };
  } catch {
    return { origin: null, destination: null };
  }
}

export default function EditarRutaMaestraDialog({ open, onOpenChange, maestra, permisoExpiraAt, onSaved }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [nombre, setNombre] = useState('');
  const [geojson, setGeojson] = useState<any>(null);
  const [filename, setFilename] = useState('');
  const [oLat, setOLat] = useState('');
  const [oLng, setOLng] = useState('');
  const [dLat, setDLat] = useState('');
  const [dLng, setDLng] = useState('');
  const [radio, setRadio] = useState('150');

  useEffect(() => {
    if (!open || !maestra) return;
    setNombre(maestra.nombre || '');
    setGeojson(maestra.route_geojson || null);
    setFilename('');
    setOLat(maestra.route_origin_lat?.toString() ?? '');
    setOLng(maestra.route_origin_lng?.toString() ?? '');
    setDLat(maestra.route_destination_lat?.toString() ?? '');
    setDLng(maestra.route_destination_lng?.toString() ?? '');
    setRadio(maestra.route_geofence_radius_m?.toString() ?? '150');
  }, [open, maestra]);

  const handleFile = async (f: File) => {
    try {
      const parsed = await parseRouteTraceFile(f);
      setGeojson(parsed.geojson);
      setFilename(f.name);
      const { origin, destination } = extractEndpoints(parsed.geojson);
      if (origin) { setOLat(String(origin.lat)); setOLng(String(origin.lng)); }
      if (destination) { setDLat(String(destination.lat)); setDLng(String(destination.lng)); }
      toast({ title: 'Trazado leído', description: f.name });
    } catch (e: any) {
      toast({ title: 'No se pudo leer', description: e.message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!maestra) return;
    if (!nombre.trim()) return toast({ title: 'Falta nombre', variant: 'destructive' });
    setBusy(true);
    const patch: Record<string, unknown> = {
      nombre: nombre.trim(),
      nombre_normalizado: '',
      route_geojson: geojson,
      route_origin_lat: oLat ? parseFloat(oLat) : null,
      route_origin_lng: oLng ? parseFloat(oLng) : null,
      route_destination_lat: dLat ? parseFloat(dLat) : null,
      route_destination_lng: dLng ? parseFloat(dLng) : null,
      route_geofence_radius_m: Math.max(50, Math.min(1000, parseInt(radio || '150', 10))),
    };
    const { error } = await supabase
      .from('rutas_foraneas_maestras' as any)
      .update(patch)
      .eq('id', maestra.id);
    setBusy(false);
    if (error) {
      toast({ title: 'No se guardó', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Ruta maestra actualizada', description: 'Los cambios se propagan a todos los concesionarios vinculados.' });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar ruta maestra</DialogTitle>
          <DialogDescription className="text-xs">
            Autorizado por el administrador.{' '}
            {permisoExpiraAt && (
              <>Vigencia: <strong>{new Date(permisoExpiraAt).toLocaleString()}</strong></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Reemplazar trazado (opcional — KML/KMZ/GPX/GeoJSON)</Label>
            <input
              type="file"
              accept=".kml,.kmz,.gpx,.geojson,.json"
              className="block w-full text-xs mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {filename && <p className="text-[11px] text-emerald-600 mt-1">✓ {filename}</p>}
          </div>

          <div className="rounded-md border p-2 space-y-2 bg-muted/40">
            <Label className="text-xs font-semibold">Geocercas A y B</Label>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">A lat</Label><Input value={oLat} onChange={(e) => setOLat(e.target.value)} /></div>
              <div><Label className="text-[10px]">A lng</Label><Input value={oLng} onChange={(e) => setOLng(e.target.value)} /></div>
              <div><Label className="text-[10px]">B lat</Label><Input value={dLat} onChange={(e) => setDLat(e.target.value)} /></div>
              <div><Label className="text-[10px]">B lng</Label><Input value={dLng} onChange={(e) => setDLng(e.target.value)} /></div>
            </div>
            <div>
              <Label className="text-[10px]">Radio (m)</Label>
              <Input type="number" value={radio} onChange={(e) => setRadio(e.target.value)} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={busy || !nombre.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
