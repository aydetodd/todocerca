ALTER TABLE public.contratos_transporte
  ADD COLUMN IF NOT EXISTS origen_lat numeric,
  ADD COLUMN IF NOT EXISTS origen_lng numeric,
  ADD COLUMN IF NOT EXISTS destino_lat numeric,
  ADD COLUMN IF NOT EXISTS destino_lng numeric,
  ADD COLUMN IF NOT EXISTS geocerca_radio_m integer NOT NULL DEFAULT 150;