-- 1. Add modelo_cobro to contratos_transporte
ALTER TABLE public.contratos_transporte
  ADD COLUMN IF NOT EXISTS modelo_cobro text NOT NULL DEFAULT 'por_persona';

ALTER TABLE public.contratos_transporte
  DROP CONSTRAINT IF EXISTS contratos_modelo_cobro_check;

ALTER TABLE public.contratos_transporte
  ADD CONSTRAINT contratos_modelo_cobro_check
  CHECK (modelo_cobro IN ('por_persona', 'por_viaje'));

-- 2. Create viajes_realizados table
CREATE TABLE IF NOT EXISTS public.viajes_realizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos_transporte(id) ON DELETE CASCADE,
  chofer_id uuid NOT NULL REFERENCES public.choferes_empresa(id) ON DELETE CASCADE,
  unidad_id uuid REFERENCES public.unidades_empresa(id) ON DELETE SET NULL,
  numero_viaje integer NOT NULL DEFAULT 1,
  fecha date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Hermosillo')::date,
  inicio_lat numeric,
  inicio_lng numeric,
  inicio_at timestamptz,
  fin_lat numeric,
  fin_lng numeric,
  fin_at timestamptz,
  estado text NOT NULL DEFAULT 'en_curso',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT viajes_estado_check CHECK (estado IN ('en_curso', 'completado', 'cancelado'))
);

CREATE INDEX IF NOT EXISTS idx_viajes_contrato_fecha ON public.viajes_realizados(contrato_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_viajes_chofer_fecha ON public.viajes_realizados(chofer_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_viajes_unidad_fecha ON public.viajes_realizados(unidad_id, fecha DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_viajes_updated_at ON public.viajes_realizados;
CREATE TRIGGER trg_viajes_updated_at
  BEFORE UPDATE ON public.viajes_realizados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS
ALTER TABLE public.viajes_realizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Concesionario ve viajes de sus contratos" ON public.viajes_realizados;
CREATE POLICY "Concesionario ve viajes de sus contratos"
  ON public.viajes_realizados FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contratos_transporte ct
      JOIN public.proveedores p ON p.id = ct.concesionario_id
      WHERE ct.id = viajes_realizados.contrato_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Empresa ve viajes de sus contratos" ON public.viajes_realizados;
CREATE POLICY "Empresa ve viajes de sus contratos"
  ON public.viajes_realizados FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contratos_transporte ct
      JOIN public.empresas_transporte e ON e.id = ct.empresa_id
      WHERE ct.id = viajes_realizados.contrato_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chofer ve sus viajes" ON public.viajes_realizados;
CREATE POLICY "Chofer ve sus viajes"
  ON public.viajes_realizados FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.choferes_empresa ce
      WHERE ce.id = viajes_realizados.chofer_id AND ce.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chofer crea sus viajes" ON public.viajes_realizados;
CREATE POLICY "Chofer crea sus viajes"
  ON public.viajes_realizados FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.choferes_empresa ce
      WHERE ce.id = viajes_realizados.chofer_id AND ce.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chofer actualiza sus viajes" ON public.viajes_realizados;
CREATE POLICY "Chofer actualiza sus viajes"
  ON public.viajes_realizados FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.choferes_empresa ce
      WHERE ce.id = viajes_realizados.chofer_id AND ce.user_id = auth.uid()
    )
  );

-- Realtime
ALTER TABLE public.viajes_realizados REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.viajes_realizados;