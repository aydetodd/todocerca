
-- Add unidad_id column to track which bus/unit the driver is using
ALTER TABLE public.asignaciones_chofer 
ADD COLUMN unidad_id UUID REFERENCES public.unidades_empresa(id) ON DELETE SET NULL;

-- Create index for unit lookups
CREATE INDEX idx_asignaciones_unidad ON public.asignaciones_chofer(unidad_id);
