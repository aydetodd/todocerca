-- Agregar campo pais a la tabla productos
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'MX';

-- Crear índice para búsquedas por país
CREATE INDEX IF NOT EXISTS idx_productos_pais ON public.productos(pais);

-- Comentario para documentación
COMMENT ON COLUMN public.productos.pais IS 'Código ISO de país (2 caracteres), ej: MX, AR, CO';