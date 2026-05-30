import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Plus, Link as LinkIcon, Unlink, MapPin, Clock, XCircle } from 'lucide-react';
import { parseRouteTraceFile } from '@/lib/routeTraceParser';

function extractEndpoints(geojson: any): { origin: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null } {
  try {
    const line = geojson?.features?.find((f: any) =>
      f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
    );
    if (!line) return { origin: null, destination: null };
    let coords: number[][] = [];
    if (line.geometry.type === 'LineString') coords = line.geometry.coordinates;
    else coords = line.geometry.coordinates.flat();
    if (coords.length < 2) return { origin: null, destination: null };
    const [oLng, oLat] = coords[0];
    const [dLng, dLat] = coords[coords.length - 1];
    return { origin: { lat: oLat, lng: oLng }, destination: { lat: dLat, lng: dLng } };
  } catch {
    return { origin: null, destination: null };
  }
}

interface Maestra {
  id: string;
  nombre: string;
  estado: 'pending' | 'approved' | 'rejected';
  created_by_user_id: string;
  rechazo_motivo: string | null;
  route_origin_lat: number | null;
  route_origin_lng: number | null;
  route_destination_lat: number | null;
  route_destination_lng: number | null;
  route_geofence_radius_m: number | null;
}

interface ProductoForaneo {
  id: string;
  nombre: string;
  ruta_maestra_id: string | null;
}

interface Props {
  proveedorId: string;
}

export default function RutasMaestrasManager({ proveedorId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [maestras, setMaestras] = useState<Maestra[]>([]);
  const [productos, setProductos] = useState<ProductoForaneo[]>([]);
  const [showProposal, setShowProposal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Proposal form
  const [propNombre, setPropNombre] = useState('');
  const [propGeojson, setPropGeojson] = useState<any>(null);
  const [propFilename, setPropFilename] = useState<string>('');
  const [propOrigin, setPropOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [propDest, setPropDest] = useState<{ lat: number; lng: number } | null>(null);
  const [propRadius, setPropRadius] = useState(150);

  const load = useCallback(async () => {
    setLoading(true);
    const [maestrasRes, productosRes] = await Promise.all([
      supabase
        .from('rutas_foraneas_maestras' as any)
        .select('*')
        .order('estado', { ascending: true })
        .order('nombre', { ascending: true }),
      supabase
        .from('productos')
        .select('id, nombre, ruta_maestra_id')
        .eq('proveedor_id', proveedorId)
        .eq('route_type', 'foranea'),
    ]);
    if (!maestrasRes.error) setMaestras((maestrasRes.data as any) || []);
    if (!productosRes.error) setProductos((productosRes.data as any) || []);
    setLoading(false);
  }, [proveedorId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('rutas-maestras-' + proveedorId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_foraneas_maestras' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos', filter: `proveedor_id=eq.${proveedorId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, proveedorId]);

  const aprobadas = maestras.filter((m) => m.estado === 'approved');
  const misPendientes = maestras.filter((m) => m.estado !== 'approved' && m.created_by_user_id === user?.id);

  const handleLink = async (productoId: string, maestraId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('link_producto_to_ruta_maestra' as any, {
      _producto_id: productoId,
      _maestra_id: maestraId,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'No se pudo vincular', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ruta vinculada al catálogo maestro' });
      load();
    }
  };

  const handleUnlink = async (productoId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('unlink_producto_from_ruta_maestra' as any, {
      _producto_id: productoId,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'No se pudo desvincular', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ruta desvinculada' });
      load();
    }
  };

  const handleTraceFile = async (file: File) => {
    try {
      const parsed = await parseRouteTraceFile(file);
      setPropGeojson(parsed.geojson);
      setPropFilename(file.name);
      const { origin, destination } = extractEndpoints(parsed.geojson);
      if (origin) setPropOrigin(origin);
      if (destination) setPropDest(destination);
      toast({
        title: 'Trazado leído',
        description: `${file.name} — origen y destino tomados de los extremos del trazado.`,
      });
    } catch (e: any) {
      toast({ title: 'No se pudo leer el archivo', description: e.message, variant: 'destructive' });
    }
  };

  const handlePropose = async () => {
    if (!propNombre.trim() || !propGeojson || !propOrigin || !propDest) {
      toast({
        title: 'Faltan datos',
        description: 'Necesitas nombre, trazado y las dos geocercas A y B.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('rutas_foraneas_maestras' as any).insert({
      nombre: propNombre.trim(),
      nombre_normalizado: '',
      route_geojson: propGeojson,
      route_origin_lat: propOrigin.lat,
      route_origin_lng: propOrigin.lng,
      route_destination_lat: propDest.lat,
      route_destination_lng: propDest.lng,
      route_geofence_radius_m: propRadius,
      created_by_user_id: user?.id,
      created_by_proveedor_id: proveedorId,
    });
    setBusy(false);
    if (error) {
      const msg = error.message.includes('rutas_foraneas_maestras_nombre_uniq')
        ? 'Ya existe una ruta con ese nombre. Búscala en el catálogo aprobado o cambia el nombre.'
        : error.message;
      toast({ title: 'No se pudo proponer', description: msg, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Propuesta enviada',
      description: 'El administrador la revisará y aprobará. Mientras tanto puedes corregirla.',
    });
    setShowProposal(false);
    setPropNombre('');
    setPropGeojson(null);
    setPropFilename('');
    setPropOrigin(null);
    setPropDest(null);
    setPropRadius(150);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Catálogo compartido de rutas foráneas
          </CardTitle>
          <CardDescription className="text-xs">
            Vincula cada una de tus rutas foráneas al catálogo maestro. Así todos los concesionarios
            que operan la misma ruta usan exactamente el mismo trazado y las mismas geocercas A y B.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {productos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tienes rutas foráneas registradas. Créalas primero desde la pestaña de Unidades /
              Choferes / Rutas.
            </p>
          ) : (
            productos.map((p) => {
              const maestra = aprobadas.find((m) => m.id === p.ruta_maestra_id);
              return (
                <div
                  key={p.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{p.nombre}</span>
                    {maestra ? (
                      <Badge variant="default" className="bg-emerald-600">
                        <LinkIcon className="h-3 w-3 mr-1" /> Vinculada
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin vincular</Badge>
                    )}
                  </div>
                  {maestra ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Usa el trazado de "{maestra.nombre}"
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnlink(p.id)}
                        disabled={busy}
                      >
                        <Unlink className="h-3 w-3 mr-1" /> Desvincular
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <Select onValueChange={(v) => handleLink(p.id, v)} disabled={busy}>
                        <SelectTrigger className="flex-1 h-9">
                          <SelectValue placeholder="Elige ruta maestra aprobada…" />
                        </SelectTrigger>
                        <SelectContent>
                          {aprobadas.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              No hay rutas maestras aprobadas todavía.
                            </div>
                          ) : (
                            aprobadas.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nombre}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowProposal(true)}
            >
              <Plus className="h-4 w-4 mr-1" /> Proponer ruta maestra nueva
            </Button>
          </div>
        </CardContent>
      </Card>

      {misPendientes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mis propuestas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {misPendientes.map((m) => (
              <div key={m.id} className="flex items-center justify-between border rounded-lg p-2">
                <div className="flex items-center gap-2">
                  {m.estado === 'pending' ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{m.nombre}</p>
                    {m.estado === 'rejected' && m.rechazo_motivo && (
                      <p className="text-xs text-red-600">Motivo: {m.rechazo_motivo}</p>
                    )}
                    {m.estado === 'pending' && (
                      <p className="text-xs text-muted-foreground">
                        En espera de aprobación del administrador
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={showProposal} onOpenChange={setShowProposal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proponer nueva ruta maestra</DialogTitle>
            <DialogDescription>
              El administrador la revisará. Una vez aprobada, otros concesionarios podrán usarla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre oficial (ej: "Cajeme – Bácum")</Label>
              <Input
                value={propNombre}
                onChange={(e) => setPropNombre(e.target.value)}
                placeholder="Cajeme – Bácum"
              />
            </div>

            <div>
              <Label className="text-xs">Archivo del trazado (KML, KMZ, GPX o GeoJSON)</Label>
              <input
                type="file"
                accept=".kml,.kmz,.gpx,.geojson,.json"
                className="block w-full text-xs mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleTraceFile(f);
                }}
              />
              {propFilename && (
                <p className="text-xs text-emerald-600 mt-1">✓ {propFilename}</p>
              )}
            </div>

            <RouteEndpointsPicker
              origin={propOrigin}
              destination={propDest}
              radiusM={propRadius}
              onChange={(o, d, r) => {
                setPropOrigin(o);
                setPropDest(d);
                setPropRadius(r);
              }}
            />

            <Button
              onClick={handlePropose}
              disabled={busy || !propNombre.trim() || !propGeojson || !propOrigin || !propDest}
              className="w-full"
            >
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Enviar propuesta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
