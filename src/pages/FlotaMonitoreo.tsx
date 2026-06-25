/**
 * Dashboard "Monitoreo de Flota" — Fase 1 del sistema dual Teléfono/Raspberry Pi.
 *
 * Muestra en una sola pantalla TODAS las unidades del concesionario actual,
 * con un badge que indica si la unidad opera con:
 *   🟡 Teléfono del chofer (sistema actual)
 *   🟢 Raspberry Pi a bordo (sistema nuevo, futuro)
 *
 * Datos 100% reales (sin mocks):
 *   - Última actualización GPS: viene de `proveedor_locations` del chofer
 *     asignado hoy a esa unidad (vía `asignaciones_chofer`).
 *   - Pasajeros a bordo: del viaje abierto en `viajes_realizados`.
 *   - Viajes hoy: conteo de `viajes_realizados` con fecha = hoy.
 *
 * Realtime: se suscribe a cambios en `proveedor_locations` y refresca
 * cada 15 s como fallback. Sin polling agresivo (respeta créditos).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Cpu, Smartphone, Users, Route as RouteIcon, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type Sistema = 'raspberry' | 'telefono' | 'sin_asignar';

interface UnidadFila {
  unidad_id: string;
  nombre: string;
  placas: string | null;
  numero_economico: string | null;
  sistema: Sistema;
  raspberry_pi_id: string | null;
  // Chofer asignado hoy (puede no haber)
  chofer_id: string | null;
  chofer_user_id: string | null;
  chofer_nombre: string | null;
  // Ruta asignada hoy
  producto_id: string | null;
  ruta_nombre: string | null;
  // GPS
  last_gps_at: string | null; // ISO
  // Viaje abierto
  pasajeros_a_bordo: number;
  viajes_hoy: number;
}

function formatHaceRato(iso: string | null): { texto: string; estado: 'verde' | 'amarillo' | 'rojo' | 'gris' } {
  if (!iso) return { texto: 'Sin datos', estado: 'gris' };
  const diff = Date.now() - new Date(iso).getTime();
  const seg = Math.max(0, Math.floor(diff / 1000));
  if (seg < 60) return { texto: `hace ${seg} s`, estado: 'verde' };
  const min = Math.floor(seg / 60);
  if (min < 5) return { texto: `hace ${min} min`, estado: 'amarillo' };
  if (min < 60) return { texto: `hace ${min} min`, estado: 'rojo' };
  const hrs = Math.floor(min / 60);
  return { texto: `hace ${hrs} h`, estado: 'gris' };
}

// Hermosillo (UTC-7): fecha "hoy" para el corte diario.
function fechaHermosilloHoy(): string {
  const ahora = new Date();
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60_000;
  const hmo = new Date(utcMs - 7 * 60 * 60_000);
  return hmo.toISOString().slice(0, 10);
}

export default function FlotaMonitoreo() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [filas, setFilas] = useState<UnidadFila[]>([]);
  const [filtro, setFiltro] = useState<'todas' | 'raspberry' | 'telefono'>('todas');
  const [tick, setTick] = useState(0); // fuerza re-render del "hace X seg"
  const refreshingRef = useRef(false);

  const cargarFlota = useCallback(async (provId: string) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const hoy = fechaHermosilloHoy();

      // 1. Unidades del concesionario.
      const { data: unidades, error: e1 } = await supabase
        .from('unidades_empresa')
        .select('id, nombre, placas, numero_economico, raspberry_pi_id, usa_raspberry, usa_telefono')
        .eq('proveedor_id', provId)
        .eq('is_active', true)
        .neq('transport_type', 'taxi') // Protocolo 2
        .order('nombre', { ascending: true });
      if (e1) throw e1;
      if (!unidades || unidades.length === 0) {
        setFilas([]);
        return;
      }

      const unidadIds = unidades.map((u) => u.id);

      // 2. Asignación más reciente de hoy por unidad.
      const { data: asigns } = await supabase
        .from('asignaciones_chofer')
        .select('unidad_id, chofer_id, producto_id, created_at')
        .in('unidad_id', unidadIds)
        .eq('fecha', hoy)
        .order('created_at', { ascending: false });

      const asignPorUnidad = new Map<string, { chofer_id: string; producto_id: string }>();
      (asigns || []).forEach((a) => {
        if (!asignPorUnidad.has(a.unidad_id)) {
          asignPorUnidad.set(a.unidad_id, { chofer_id: a.chofer_id, producto_id: a.producto_id });
        }
      });

      const choferIds = Array.from(new Set(Array.from(asignPorUnidad.values()).map((x) => x.chofer_id)));
      const productoIds = Array.from(new Set(Array.from(asignPorUnidad.values()).map((x) => x.producto_id)));

      // 3. Datos del chofer (nombre + user_id para GPS).
      const choferes = choferIds.length
        ? (
            await supabase
              .from('choferes_empresa')
              .select('id, nombre, user_id')
              .in('id', choferIds)
          ).data || []
        : [];
      const choferMap = new Map(choferes.map((c) => [c.id, c]));

      // 4. Nombre de ruta.
      const productos = productoIds.length
        ? (await supabase.from('productos').select('id, nombre').in('id', productoIds)).data || []
        : [];
      const productoMap = new Map(productos.map((p) => [p.id, p.nombre]));

      // 5. GPS más reciente de cada chofer.
      const userIds = choferes.map((c) => c.user_id).filter(Boolean) as string[];
      const locs = userIds.length
        ? (
            await supabase
              .from('proveedor_locations')
              .select('user_id, updated_at')
              .in('user_id', userIds)
          ).data || []
        : [];
      const gpsMap = new Map(locs.map((l) => [l.user_id, l.updated_at]));

      // 6. Viajes de hoy por unidad: abiertos (pasajeros) y conteo total.
      const { data: viajes } = await supabase
        .from('viajes_realizados')
        .select('unidad_id, estado, pasajeros_a_bordo')
        .in('unidad_id', unidadIds)
        .eq('fecha', hoy);

      const viajeStats = new Map<string, { abiertos_pax: number; total: number }>();
      (viajes || []).forEach((v) => {
        const s = viajeStats.get(v.unidad_id) || { abiertos_pax: 0, total: 0 };
        s.total += 1;
        if (v.estado === 'abierto') s.abiertos_pax += v.pasajeros_a_bordo || 0;
        viajeStats.set(v.unidad_id, s);
      });

      // 7. Armar filas.
      const rows: UnidadFila[] = unidades.map((u) => {
        const asign = asignPorUnidad.get(u.id);
        const chofer = asign ? choferMap.get(asign.chofer_id) : undefined;
        const sistema: Sistema = u.usa_raspberry
          ? 'raspberry'
          : u.usa_telefono
          ? 'telefono'
          : 'sin_asignar';
        const stats = viajeStats.get(u.id) || { abiertos_pax: 0, total: 0 };
        return {
          unidad_id: u.id,
          nombre: u.nombre || u.numero_economico || 'Unidad',
          placas: u.placas,
          numero_economico: u.numero_economico,
          sistema,
          raspberry_pi_id: u.raspberry_pi_id,
          chofer_id: asign?.chofer_id ?? null,
          chofer_user_id: chofer?.user_id ?? null,
          chofer_nombre: chofer?.nombre ?? null,
          producto_id: asign?.producto_id ?? null,
          ruta_nombre: asign ? productoMap.get(asign.producto_id) ?? null : null,
          last_gps_at: chofer?.user_id ? gpsMap.get(chofer.user_id) ?? null : null,
          pasajeros_a_bordo: stats.abiertos_pax,
          viajes_hoy: stats.total,
        };
      });

      setFilas(rows);
    } catch (err: any) {
      console.error('[FlotaMonitoreo] error:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      refreshingRef.current = false;
    }
  }, [toast]);

  // Carga inicial.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    (async () => {
      try {
        const { data: prov } = await supabase
          .from('proveedores')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!prov) {
          toast({
            title: 'Acceso denegado',
            description: 'Solo concesionarios pueden ver este panel.',
            variant: 'destructive',
          });
          navigate('/panel-concesionario');
          return;
        }
        setProveedorId(prov.id);
        await cargarFlota(prov.id);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, navigate, toast, cargarFlota]);

  // Realtime: cuando hay cambio en proveedor_locations, refrescamos.
  useEffect(() => {
    if (!proveedorId) return;
    const channel = supabase
      .channel(`flota-monitoreo-${proveedorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proveedor_locations' },
        () => cargarFlota(proveedorId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'viajes_realizados' },
        () => cargarFlota(proveedorId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [proveedorId, cargarFlota]);

  // Fallback: refresca cada 15s + tick cada 5s para "hace X seg".
  useEffect(() => {
    if (!proveedorId) return;
    const t1 = setInterval(() => cargarFlota(proveedorId), 15_000);
    const t2 = setInterval(() => setTick((x) => x + 1), 5_000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [proveedorId, cargarFlota]);

  const filasFiltradas = useMemo(() => {
    if (filtro === 'todas') return filas;
    return filas.filter((f) => f.sistema === filtro);
  }, [filas, filtro]);

  const conteos = useMemo(() => {
    const r = filas.filter((f) => f.sistema === 'raspberry').length;
    const t = filas.filter((f) => f.sistema === 'telefono').length;
    return { todas: filas.length, raspberry: r, telefono: t };
  }, [filas]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main className="container mx-auto px-4 py-6 pb-40 max-w-3xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/panel-concesionario')}
          className="mb-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Panel de Concesionario
        </Button>

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Monitoreo de Flota</h1>
            <p className="text-sm text-muted-foreground">
              Todas tus unidades en tiempo real: con teléfono o con Raspberry Pi.
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => proveedorId && cargarFlota(proveedorId)}
            aria-label="Refrescar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)} className="mb-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="todas">Todas ({conteos.todas})</TabsTrigger>
            <TabsTrigger value="raspberry" className="gap-1">
              <Cpu className="h-3 w-3" /> Pi ({conteos.raspberry})
            </TabsTrigger>
            <TabsTrigger value="telefono" className="gap-1">
              <Smartphone className="h-3 w-3" /> Teléfono ({conteos.telefono})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {filasFiltradas.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {filas.length === 0
                ? 'Aún no tienes unidades activas.'
                : 'No hay unidades con ese sistema.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3" data-tick={tick}>
            {filasFiltradas.map((f) => {
              const gps = formatHaceRato(f.last_gps_at);
              const color =
                gps.estado === 'verde'
                  ? 'bg-emerald-500'
                  : gps.estado === 'amarillo'
                  ? 'bg-amber-500'
                  : gps.estado === 'rojo'
                  ? 'bg-red-500'
                  : 'bg-muted-foreground/40';
              return (
                <Card key={f.unidad_id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            f.sistema === 'raspberry'
                              ? 'bg-emerald-100'
                              : f.sistema === 'telefono'
                              ? 'bg-amber-100'
                              : 'bg-muted'
                          }`}
                          aria-hidden
                        >
                          {f.sistema === 'raspberry' ? (
                            <Cpu className="h-6 w-6 text-emerald-700" />
                          ) : (
                            <Smartphone className="h-6 w-6 text-amber-700" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{f.nombre}</h3>
                            {f.placas && (
                              <Badge variant="outline" className="text-[10px]">
                                {f.placas}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {f.sistema === 'raspberry'
                              ? `🟢 Raspberry Pi · ${f.raspberry_pi_id ?? 'sin ID'}`
                              : f.sistema === 'telefono'
                              ? '🟡 Teléfono del chofer'
                              : '⚪ Sin sistema activo'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <span className={`w-2 h-2 rounded-full ${color}`} aria-hidden />
                        <span className="text-muted-foreground">{gps.texto}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-muted/40 rounded-lg p-2">
                        <div className="text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> A bordo
                        </div>
                        <div className="font-semibold text-base">{f.pasajeros_a_bordo}</div>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-2">
                        <div className="text-muted-foreground flex items-center gap-1">
                          <RouteIcon className="h-3 w-3" /> Viajes hoy
                        </div>
                        <div className="font-semibold text-base">{f.viajes_hoy}</div>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-2">
                        <div className="text-muted-foreground">Chofer</div>
                        <div className="font-semibold text-[11px] truncate">
                          {f.chofer_nombre ?? '—'}
                        </div>
                      </div>
                    </div>

                    {f.ruta_nombre && (
                      <p className="text-[11px] text-muted-foreground mt-2 truncate">
                        Ruta: <span className="text-foreground">{f.ruta_nombre}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
