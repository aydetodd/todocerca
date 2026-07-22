import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useHispanoamerica } from '@/hooks/useHispanoamerica';
import { PAISES_HISPANOAMERICA } from '@/data/paises-hispanoamerica';
import { Map as MapIcon, X, Loader2 } from 'lucide-react';
import type { FleetRouteItem } from '@/components/FleetRouteFilter';

interface Props {
  active: boolean;
  onToggle: (on: boolean) => void;
  onRoutesLoaded: (routes: Array<FleetRouteItem & { route_geojson: any }>) => void;
}

const PALETTE = [
  '#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#9A6324', '#800000', '#808000',
  '#000075', '#469990', '#bfef45', '#fabed4', '#dcbeff',
  '#a9a9a9', '#ffd8b1', '#aaffc3', '#ffe119', '#000000',
];

export function ExplorarForaneasPicker({ active, onToggle, onRoutesLoaded }: Props) {
  const { getNivel1, getNivel2, loading: geoLoading } = useHispanoamerica();
  const [pais, setPais] = useState<string>('MX');
  const [estado, setEstado] = useState<string>('');
  const [municipio, setMunicipio] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const paisData = PAISES_HISPANOAMERICA.find((p) => p.codigo === pais);
  const estados = getNivel1(pais);
  const municipios = estado ? getNivel2(pais, estado) : [];

  useEffect(() => {
    if (!active || !estado || !municipio) {
      setCount(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, route_geojson')
        .eq('route_type', 'foranea')
        .eq('pais', pais)
        .eq('estado', estado)
        .eq('ciudad', municipio)
        .not('route_geojson', 'is', null);

      if (error) {
        console.error('[ExplorarForaneas]', error);
        setLoading(false);
        return;
      }

      const items = (data || [])
        .filter((r: any) => r.route_geojson?.features?.length)
        .map((r: any, i: number) => ({
          id: r.id,
          nombre: r.nombre || `Ruta ${i + 1}`,
          route_group: null,
          color: PALETTE[i % PALETTE.length],
          route_geojson: r.route_geojson,
        }));

      setCount(items.length);
      onRoutesLoaded(items);
      setLoading(false);
    })();
  }, [active, pais, estado, municipio, onRoutesLoaded]);

  if (!active) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggle(true)}
        className="shadow-lg backdrop-blur-sm bg-background/90 hover:bg-background text-foreground"
      >
        <MapIcon className="h-4 w-4 mr-2" />
        Explorar foráneas
      </Button>
    );
  }

  return (
    <Card className="p-2 shadow-lg bg-background/95 backdrop-blur-sm w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold flex items-center gap-1">
          <MapIcon className="h-3 w-3" /> Rutas foráneas del municipio
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => {
            onToggle(false);
            onRoutesLoaded([]);
            setEstado('');
            setMunicipio('');
            setCount(null);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Select
          value={pais}
          onValueChange={(v) => {
            setPais(v);
            setEstado('');
            setMunicipio('');
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            {PAISES_HISPANOAMERICA.map((p) => (
              <SelectItem key={p.codigo} value={p.codigo}>
                {p.bandera} {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={estado}
          onValueChange={(v) => {
            setEstado(v);
            setMunicipio('');
          }}
          disabled={geoLoading || estados.length === 0}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={paisData?.nivel1Tipo || 'Estado'} />
          </SelectTrigger>
          <SelectContent>
            {estados.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={municipio}
          onValueChange={setMunicipio}
          disabled={!estado || municipios.length === 0}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={paisData?.nivel2Tipo || 'Municipio'} />
          </SelectTrigger>
          <SelectContent>
            {municipios.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-[11px] text-muted-foreground pt-1 min-h-[16px]">
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
            </span>
          ) : count === null ? (
            'Elige municipio para ver las rutas'
          ) : count === 0 ? (
            'Sin rutas foráneas trazadas aquí todavía'
          ) : (
            `${count} ruta(s) — enciende/apaga abajo`
          )}
        </div>
      </div>
    </Card>
  );
}
