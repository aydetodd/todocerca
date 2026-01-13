ALTER TABLE public.votaciones
  DROP CONSTRAINT IF EXISTS votaciones_nivel_check;

ALTER TABLE public.votaciones
  ADD CONSTRAINT votaciones_nivel_check
  CHECK (nivel IN ('familiar','nacional','estatal','ciudad','barrio','escuela'));