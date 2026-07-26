
ALTER TABLE public.viajes_realizados
  ADD COLUMN IF NOT EXISTS retirado_at timestamptz,
  ADD COLUMN IF NOT EXISTS retiro_metodo text,
  ADD COLUMN IF NOT EXISTS retiro_neto_mxn numeric,
  ADD COLUMN IF NOT EXISTS retiro_bruto_mxn numeric,
  ADD COLUMN IF NOT EXISTS retiro_referencia text,
  ADD COLUMN IF NOT EXISTS retiro_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_viajes_retirado ON public.viajes_realizados(retirado_at);
