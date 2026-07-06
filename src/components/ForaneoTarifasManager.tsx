import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Plus, Trash2, DollarSign, ArrowUp, ArrowDown } from 'lucide-react';

type Producto = { id: string; nombre: string };
type Geocerca = { id: string; producto_id: string; nombre: string; lat: number; lng: number; radio_m: number; orden: number };
type Tarifa = { id?: string; producto_id: string; desde_geocerca_id: string; hasta_geocerca_id: string; precio_mxn: number };

interface Props { proveedorId: string }

export default function ForaneoTarifasManager({ proveedorId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productoId, setProductoId] = useState<string>('');
  const [geocercas, setGeocercas] = useState<Geocerca[]>([]);
  const [tarifas, setTarifas] = useState<Record<string, number>>({}); // key: `${desde}|${hasta}` -> precio
  const [nueva, setNueva] = useState({ nombre: '', lat: '', lng: '', radio_m: '150' });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre')
        .eq('proveedor_id', proveedorId)
        .eq('route_type', 'foranea')
        .order('nombre');
      setProductos((data as any) || []);
      if (data && data[0]) setProductoId(data[0].id);
      setLoading(false);
    })();
  }, [proveedorId]);

  useEffect(() => {
    if (!productoId) return;
    (async () => {
      const { data: gc } = await supabase
        .from('ruta_geocercas_cobro')
        .select('*')
        .eq('producto_id', productoId)
        .order('orden');
      setGeocercas((gc as any) || []);
      const { data: tr } = await supabase
        .from('ruta_tarifas_tramo')
        .select('*')
        .eq('producto_id', productoId);
      const map: Record<string, number> = {};
      (tr || []).forEach((t: any) => { map[`${t.desde_geocerca_id}|${t.hasta_geocerca_id}`] = Number(t.precio_mxn); });
      setTarifas(map);
    })();
  }, [productoId]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast({ title: 'GPS no disponible', variant: 'destructive' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setNueva((n) => ({ ...n, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
      () => toast({ title: 'No se pudo obtener ubicación', variant: 'destructive' })
    );
  };

  const agregarGeocerca = async () => {
    if (!productoId) return;
    const lat = parseFloat(nueva.lat), lng = parseFloat(nueva.lng), radio = parseInt(nueva.radio_m);
    if (!nueva.nombre.trim() || isNaN(lat) || isNaN(lng) || isNaN(radio)) {
      return toast({ title: 'Datos incompletos', description: 'Nombre, lat, lng y radio son requeridos.', variant: 'destructive' });
    }
    const orden = (geocercas[geocercas.length - 1]?.orden ?? -1) + 1;
    const { data, error } = await supabase
      .from('ruta_geocercas_cobro')
      .insert({ producto_id: productoId, nombre: nueva.nombre.trim(), lat, lng, radio_m: radio, orden })
      .select()
      .single();
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setGeocercas((g) => [...g, data as any]);
    setNueva({ nombre: '', lat: '', lng: '', radio_m: '150' });
    toast({ title: 'Geocerca agregada' });
  };

  const eliminarGeocerca = async (id: string) => {
    if (!confirm('¿Eliminar esta geocerca? Se borran también sus tarifas.')) return;
    const { error } = await supabase.from('ruta_geocercas_cobro').delete().eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setGeocercas((g) => g.filter((x) => x.id !== id));
    setTarifas((t) => {
      const copy = { ...t };
      Object.keys(copy).forEach((k) => { if (k.includes(id)) delete copy[k]; });
      return copy;
    });
  };

  const moverGeocerca = async (id: string, dir: -1 | 1) => {
    const idx = geocercas.findIndex((g) => g.id === id);
    const other = idx + dir;
    if (other < 0 || other >= geocercas.length) return;
    const a = geocercas[idx], b = geocercas[other];
    const copy = [...geocercas];
    copy[idx] = { ...b, orden: a.orden };
    copy[other] = { ...a, orden: b.orden };
    setGeocercas(copy);
    await Promise.all([
      supabase.from('ruta_geocercas_cobro').update({ orden: b.orden }).eq('id', a.id),
      supabase.from('ruta_geocercas_cobro').update({ orden: a.orden }).eq('id', b.id),
    ]);
  };

  const pares = useMemo(() => {
    const arr: { desde: Geocerca; hasta: Geocerca }[] = [];
    for (let i = 0; i < geocercas.length; i++)
      for (let j = i + 1; j < geocercas.length; j++)
        arr.push({ desde: geocercas[i], hasta: geocercas[j] });
    return arr;
  }, [geocercas]);

  const setPrecio = (desde: string, hasta: string, val: string) => {
    const n = parseFloat(val);
    setTarifas((t) => ({ ...t, [`${desde}|${hasta}`]: isNaN(n) ? 0 : n }));
  };

  const guardarTarifas = async () => {
    if (!productoId) return;
    setSaving(true);
    try {
      const rows: Tarifa[] = pares
        .map(({ desde, hasta }) => ({
          producto_id: productoId,
          desde_geocerca_id: desde.id,
          hasta_geocerca_id: hasta.id,
          precio_mxn: tarifas[`${desde.id}|${hasta.id}`] ?? 0,
        }))
        .filter((r) => r.precio_mxn > 0);
      await supabase.from('ruta_tarifas_tramo').delete().eq('producto_id', productoId);
      if (rows.length) {
        const { error } = await supabase.from('ruta_tarifas_tramo').insert(rows);
        if (error) throw error;
      }
      toast({ title: 'Tarifas guardadas', description: `${rows.length} tramos.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!productos.length)
    return <p className="text-sm text-muted-foreground p-4">No tienes rutas foráneas registradas.</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobro por tramo (QR sube/baja)</CardTitle>
          <CardDescription className="text-xs">
            Define los puntos donde el chofer cobra QR. Si la ruta cobra un solo precio, crea 1 sola geocerca.
            Si tiene tramos con distinto precio, crea varias y define la tarifa entre cada par.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="text-xs font-medium">Ruta</label>
          <Select value={productoId} onValueChange={setProductoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {productos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Geocercas de cobro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {geocercas.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay geocercas.</p>}
          {geocercas.map((g, i) => (
            <div key={g.id} className="flex items-center gap-2 border rounded-md p-2">
              <span className="text-xs font-bold w-6">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{g.nombre}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.lat.toFixed(5)}, {g.lng.toFixed(5)} · {g.radio_m}m
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => moverGeocerca(g.id, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" onClick={() => moverGeocerca(g.id, 1)} disabled={i === geocercas.length - 1}><ArrowDown className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" onClick={() => eliminarGeocerca(g.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          ))}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium">Agregar nueva</p>
            <Input placeholder="Nombre (ej. Central Obregón)" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Latitud" value={nueva.lat} onChange={(e) => setNueva({ ...nueva, lat: e.target.value })} />
              <Input placeholder="Longitud" value={nueva.lng} onChange={(e) => setNueva({ ...nueva, lng: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Radio en metros" value={nueva.radio_m} onChange={(e) => setNueva({ ...nueva, radio_m: e.target.value })} />
              <Button variant="outline" size="sm" onClick={useMyLocation}><MapPin className="h-3 w-3 mr-1" /> Mi ubicación</Button>
            </div>
            <Button size="sm" className="w-full" onClick={agregarGeocerca}><Plus className="h-3 w-3 mr-1" /> Agregar geocerca</Button>
          </div>
        </CardContent>
      </Card>

      {geocercas.length >= 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Tarifas entre puntos</CardTitle>
            <CardDescription className="text-xs">
              {geocercas.length === 1
                ? 'Con 1 sola geocerca, la tarifa es tarifa fija de la ruta. Escríbela aquí.'
                : 'Escribe el precio en pesos para cada par (desde → hasta). Deja en 0 los pares que no cobras.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {geocercas.length === 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs flex-1">{geocercas[0].nombre} (tarifa única)</span>
                <Input
                  type="number"
                  className="w-24"
                  placeholder="$"
                  value={tarifas[`${geocercas[0].id}|${geocercas[0].id}`] ?? ''}
                  onChange={(e) => setPrecio(geocercas[0].id, geocercas[0].id, e.target.value)}
                />
              </div>
            ) : (
              pares.map(({ desde, hasta }) => {
                const k = `${desde.id}|${hasta.id}`;
                return (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{desde.nombre} → {hasta.nombre}</span>
                    <Input
                      type="number"
                      className="w-24 h-8"
                      placeholder="$"
                      value={tarifas[k] ?? ''}
                      onChange={(e) => setPrecio(desde.id, hasta.id, e.target.value)}
                    />
                  </div>
                );
              })
            )}
            <Button className="w-full mt-3" onClick={guardarTarifas} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar tarifas'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
