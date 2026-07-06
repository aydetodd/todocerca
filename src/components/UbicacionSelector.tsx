import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export interface UbicacionValue {
  paisId: string;
  estadoId: string;
  municipioId: string;
}

interface Props {
  value: UbicacionValue;
  onChange: (v: UbicacionValue) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

interface Row { id: string; nombre: string }

/**
 * Selector obligatorio en cascada: País → Estado → Municipio.
 * Escribe qard_nivel2_id (municipio) para el generador de QaRd.
 */
export default function UbicacionSelector({ value, onChange, required, disabled, compact }: Props) {
  const [paises, setPaises] = useState<Row[]>([]);
  const [estados, setEstados] = useState<Row[]>([]);
  const [municipios, setMunicipios] = useState<Row[]>([]);
  const [loadingPaises, setLoadingPaises] = useState(true);
  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMuni, setLoadingMuni] = useState(false);

  // Cargar países activos
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('paises')
        .select('id, nombre')
        .eq('is_active', true)
        .order('nombre');
      setPaises((data || []) as Row[]);
      setLoadingPaises(false);
    })();
  }, []);

  // Cargar estados cuando cambia país
  useEffect(() => {
    if (!value.paisId) { setEstados([]); return; }
    setLoadingEstados(true);
    (async () => {
      const { data } = await supabase
        .from('subdivisiones_nivel1')
        .select('id, nombre')
        .eq('pais_id', value.paisId)
        .eq('is_active', true)
        .order('nombre');
      setEstados((data || []) as Row[]);
      setLoadingEstados(false);
    })();
  }, [value.paisId]);

  // Cargar municipios cuando cambia estado
  useEffect(() => {
    if (!value.estadoId) { setMunicipios([]); return; }
    setLoadingMuni(true);
    (async () => {
      const { data } = await supabase
        .from('subdivisiones_nivel2')
        .select('id, nombre')
        .eq('nivel1_id', value.estadoId)
        .eq('is_active', true)
        .order('nombre');
      setMunicipios((data || []) as Row[]);
      setLoadingMuni(false);
    })();
  }, [value.estadoId]);

  const gap = compact ? 'space-y-2' : 'space-y-3';

  return (
    <div className={gap}>
      <div>
        <Label>País {required && '*'}</Label>
        <Select
          value={value.paisId}
          disabled={disabled || loadingPaises}
          onValueChange={(v) => onChange({ paisId: v, estadoId: '', municipioId: '' })}
        >
          <SelectTrigger>
            <SelectValue placeholder={loadingPaises ? 'Cargando...' : 'Selecciona tu país'} />
          </SelectTrigger>
          <SelectContent>
            {paises.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Estado / Provincia {required && '*'}</Label>
        <Select
          value={value.estadoId}
          disabled={disabled || !value.paisId || loadingEstados}
          onValueChange={(v) => onChange({ ...value, estadoId: v, municipioId: '' })}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              !value.paisId ? 'Primero elige el país' :
              loadingEstados ? 'Cargando...' : 'Selecciona tu estado'
            } />
          </SelectTrigger>
          <SelectContent>
            {estados.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Municipio / Ciudad {required && '*'}</Label>
        <Select
          value={value.municipioId}
          disabled={disabled || !value.estadoId || loadingMuni}
          onValueChange={(v) => onChange({ ...value, municipioId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              !value.estadoId ? 'Primero elige el estado' :
              loadingMuni ? 'Cargando...' : 'Selecciona tu municipio'
            } />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {municipios.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.estadoId && !loadingMuni && municipios.length === 0 && (
          <p className="text-xs text-amber-500 mt-1">
            <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
            No hay municipios cargados para este estado todavía.
          </p>
        )}
      </div>
    </div>
  );
}
