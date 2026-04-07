
-- Add ticket type breakdown columns to liquidaciones_diarias
ALTER TABLE public.liquidaciones_diarias
  ADD COLUMN IF NOT EXISTS boletos_normales integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boletos_estudiante integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boletos_tercera_edad integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_normales numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_estudiante numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_tercera_edad numeric NOT NULL DEFAULT 0;
