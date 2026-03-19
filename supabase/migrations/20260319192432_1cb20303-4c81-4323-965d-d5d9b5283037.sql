-- Add producto_id (route) column to logs_validacion_qr
ALTER TABLE public.logs_validacion_qr
ADD COLUMN producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL;

-- Add index for efficient filtering by route
CREATE INDEX idx_logs_validacion_qr_producto_id ON public.logs_validacion_qr(producto_id);