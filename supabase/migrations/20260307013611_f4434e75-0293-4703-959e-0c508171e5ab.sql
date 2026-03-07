ALTER TABLE public.verificaciones_concesionario
  ADD COLUMN IF NOT EXISTS total_unidades integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_solicitud timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fecha_revision timestamp with time zone;