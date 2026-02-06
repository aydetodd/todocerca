
-- Create table for vehicle units (buses) - the subscription billing unit
CREATE TABLE public.unidades_empresa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL, -- Economic number or identifier
  placas VARCHAR(20), -- License plates (optional)
  descripcion TEXT, -- Optional description
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.unidades_empresa ENABLE ROW LEVEL SECURITY;

-- Policies: Proveedores can manage their own units
CREATE POLICY "Proveedores can view their own units"
  ON public.unidades_empresa FOR SELECT
  USING (
    proveedor_id IN (
      SELECT id FROM public.proveedores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Proveedores can insert their own units"
  ON public.unidades_empresa FOR INSERT
  WITH CHECK (
    proveedor_id IN (
      SELECT id FROM public.proveedores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Proveedores can update their own units"
  ON public.unidades_empresa FOR UPDATE
  USING (
    proveedor_id IN (
      SELECT id FROM public.proveedores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Proveedores can delete their own units"
  ON public.unidades_empresa FOR DELETE
  USING (
    proveedor_id IN (
      SELECT id FROM public.proveedores WHERE user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_unidades_empresa_updated_at
  BEFORE UPDATE ON public.unidades_empresa
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
