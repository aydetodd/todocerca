
-- 1. Vinculación ESP32 ↔ unidad
ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS esp32_mac text,
  ADD COLUMN IF NOT EXISTS esp32_secret text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unidades_empresa_esp32_mac
  ON public.unidades_empresa (lower(esp32_mac))
  WHERE esp32_mac IS NOT NULL;

-- 2. Contadores en cada viaje
ALTER TABLE public.viajes_realizados
  ADD COLUMN IF NOT EXISTS pasajeros_subidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pasajeros_bajados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pasajeros_a_bordo integer NOT NULL DEFAULT 0;

-- 3. Bitácora de eventos individuales
CREATE TABLE IF NOT EXISTS public.conteo_pasajeros_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id uuid REFERENCES public.viajes_realizados(id) ON DELETE SET NULL,
  unidad_id uuid REFERENCES public.unidades_empresa(id) ON DELETE SET NULL,
  esp32_mac text NOT NULL,
  puerta text NOT NULL CHECK (puerta IN ('frente','atras')),
  evento text NOT NULL CHECK (evento IN ('sube','baja')),
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteo_viaje ON public.conteo_pasajeros_eventos(viaje_id, ocurrido_en);
CREATE INDEX IF NOT EXISTS idx_conteo_unidad_fecha ON public.conteo_pasajeros_eventos(unidad_id, ocurrido_en DESC);

GRANT SELECT ON public.conteo_pasajeros_eventos TO authenticated;
GRANT ALL ON public.conteo_pasajeros_eventos TO service_role;

ALTER TABLE public.conteo_pasajeros_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionario ve conteos de sus unidades"
  ON public.conteo_pasajeros_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.unidades_empresa ue
      JOIN public.proveedores pr ON pr.id = ue.proveedor_id
      WHERE ue.id = conteo_pasajeros_eventos.unidad_id
        AND pr.user_id = auth.uid()
    )
  );

CREATE POLICY "Empresa ve conteos de viajes de sus contratos"
  ON public.conteo_pasajeros_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.viajes_realizados v
      JOIN public.contratos_transporte ct ON ct.id = v.contrato_id
      JOIN public.empresas_transporte e ON e.id = ct.empresa_id
      WHERE v.id = conteo_pasajeros_eventos.viaje_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Chofer ve conteos de sus viajes"
  ON public.conteo_pasajeros_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.viajes_realizados v
      JOIN public.choferes_empresa ce ON ce.id = v.chofer_id
      WHERE v.id = conteo_pasajeros_eventos.viaje_id
        AND ce.user_id = auth.uid()
    )
  );
