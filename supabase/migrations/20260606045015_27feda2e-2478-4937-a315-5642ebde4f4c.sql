
ALTER TABLE public.conteo_pasajeros_eventos
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS ocurrido_en timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conteo_eventos_unidad_fecha
  ON public.conteo_pasajeros_eventos (unidad_id, ocurrido_en DESC);
