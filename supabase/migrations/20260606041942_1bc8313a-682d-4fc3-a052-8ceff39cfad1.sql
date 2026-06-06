ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS conteo_subscription_id text,
  ADD COLUMN IF NOT EXISTS conteo_subscription_status text,
  ADD COLUMN IF NOT EXISTS conteo_subscription_end timestamptz;