
ALTER TABLE public.viajes_realizados
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS inicio_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fin_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.viajes_realizados
  DROP CONSTRAINT IF EXISTS viajes_direccion_check;

ALTER TABLE public.viajes_realizados
  ADD CONSTRAINT viajes_direccion_check
  CHECK (direccion IS NULL OR direccion IN ('AB','BA'));
