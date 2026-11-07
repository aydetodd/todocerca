import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, X } from 'lucide-react';
import { BrandIcon } from '@/components/BrandIcon';
import ProvidersMapView from '@/components/ProvidersMapView';
import { useHispanoamerica } from '@/hooks/useHispanoamerica';
import { isPublicTransportType, type PublicTransportType } from '@/lib/publicTransport';

type PublicRoute = { id: string; nombre: string; unit_count: number };
export default function PublicTransport() {
  const [type, setType] = useState<PublicTransportType>('taxi_colectivo');
  const [estado, setEstado] = useState(() => localStorage.getItem('lastSearchEstado') || '');
  const [ciudad, setCiudad] = useState(() => localStorage.getItem('lastSearchCiudad') || '');
  const [query, setQuery] = useState('');
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [selected, setSelected] = useState<PublicRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { getNivel1, getNivel2 } = useHispanoamerica();

  useEffect(() => {
    if (!isPublicTransportType(type)) return;
    let active = true;
    const load = async () => {
      const { data, error: failure } = await supabase.rpc('get_public_routes_with_live_units', {
        _estado: estado || undefined, _ciudad: ciudad || undefined, _route_type: type,
      });
      if (!active) return;
      setError(failure ? 'No se pudieron consultar las rutas. Intenta nuevamente.' : '');
      setRoutes(data || []);
      setLoading(false);
    };
    setLoading(true);
    void load();
    // The public RPC is the authority; private driver/profile rows are never queried here.
    const timer = window.setInterval(load, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [type, estado, ciudad]);

  return <div className="min-h-screen bg-background pb-40">
    <header className="border-b border-border">
      <div className="max-w-4xl mx-auto p-4 flex items-center justify-between gap-3">
        <a href="/landing" className="flex items-center gap-2 font-bold text-foreground"><BrandIcon className="h-8 w-8" />TodoCerca</a>
        <Button variant="outline" asChild><a href="/auth">Iniciar sesión</a></Button>
      </div>
    </header>
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Buscar transporte</h1>
      <div className="flex flex-wrap gap-2" aria-label="Tipo de transporte">
        {([{ value: 'urbana', label: 'Urbano' }, { value: 'foranea', label: 'Foráneo' }, { value: 'taxi_colectivo', label: 'Taxi Colectivo' }] as const).map(item =>
          <Button key={item.value} variant={type === item.value ? 'default' : 'outline'} aria-pressed={type === item.value} onClick={() => { setSelected(null); setType(item.value); }}>{item.label}</Button>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="space-y-2 text-sm font-medium">Estado
          <select aria-label="Estado" value={estado} onChange={event => { setEstado(event.target.value); setCiudad(''); setSelected(null); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-foreground">
            <option value="">Todos los estados</option>{getNivel1('MX').map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">Localidad
          <select aria-label="Localidad" value={ciudad} disabled={!estado} onChange={event => { setCiudad(event.target.value); setSelected(null); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-foreground disabled:opacity-50">
            <option value="">Todas las localidades</option>{getNivel2('MX', estado).map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar ruta" placeholder="Buscar ruta" className="pl-9" value={query} onChange={event => setQuery(event.target.value)} /></div>
      {loading ? <p role="status">Consultando rutas…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : <div className="divide-y divide-border">
        {routes.filter(route => route.nombre.toLowerCase().includes(query.toLowerCase())).map(route => <div key={route.id} className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0"><h2 className="font-semibold break-words">{route.nombre}</h2><p className="text-sm text-muted-foreground">{route.unit_count} {route.unit_count === 1 ? 'unidad disponible' : 'unidades disponibles'}</p></div>
          <Button onClick={() => setSelected(route)}>Ver mapa</Button>
        </div>)}
        {routes.length === 0 && <p className="py-4 text-muted-foreground">No hay unidades disponibles en esta ubicación.</p>}
      </div>}
    </main>
    {selected && <section aria-label="Mapa de transporte público" className="fixed inset-0 z-50 bg-background">
      <div className="absolute top-3 left-14 right-3 z-[1000] flex justify-between items-start gap-2 pointer-events-none">
        <div className="bg-background/95 border border-border rounded-md px-3 py-2 max-w-xs"><p className="font-semibold break-words">{selected.nombre}</p></div>
        <Button className="pointer-events-auto shrink-0" variant="secondary" aria-label="Cerrar mapa" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
      </div>
      <ProvidersMapView providers={[]} vehicleFilter="ruta" routeProductoId={selected.id} routeName={selected.nombre} routeType={type} />
    </section>}
    <div className="max-w-4xl mx-auto px-4"><Button variant="ghost" asChild><a href="/landing"><ArrowLeft className="h-4 w-4 mr-2" />Volver</a></Button></div>
  </div>;
}