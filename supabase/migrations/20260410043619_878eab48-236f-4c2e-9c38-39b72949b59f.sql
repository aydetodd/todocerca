
ALTER TABLE public.contratos_transporte
ADD COLUMN turnos jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contratos_transporte.turnos IS 'Array of {turno, unidades} objects, e.g. [{"turno":"matutino","unidades":3}]';
