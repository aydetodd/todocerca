-- Add categories for better product organization
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default product categories
INSERT INTO public.product_categories (name, description) VALUES
('Frutas', 'Frutas frescas y de temporada'),
('Verduras', 'Verduras y hortalizas'),
('Lácteos', 'Productos lácteos y derivados'),
('Carnes', 'Carnes frescas y procesadas'),
('Granos', 'Cereales, legumbres y granos'),
('Panadería', 'Pan, pasteles y productos de panadería'),
('Bebidas', 'Jugos, refrescos y bebidas'),
('Especias', 'Condimentos y especias'),
('Otros', 'Otros productos')
ON CONFLICT (name) DO NOTHING;

-- Add category_id to productos table if it doesn't exist
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id);

-- Add search optimization columns
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS keywords TEXT,
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg';

-- Update fotos_productos to be more flexible
ALTER TABLE public.fotos_productos 
ADD COLUMN IF NOT EXISTS alt_text TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Add constraint for maximum 50 products per provider
CREATE OR REPLACE FUNCTION check_product_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM productos WHERE proveedor_id = NEW.proveedor_id) >= 50 THEN
    RAISE EXCEPTION 'No se pueden registrar más de 50 productos por proveedor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for product limit
DROP TRIGGER IF EXISTS enforce_product_limit ON productos;
CREATE TRIGGER enforce_product_limit
  BEFORE INSERT ON productos
  FOR EACH ROW
  EXECUTE FUNCTION check_product_limit();

-- Enable RLS on product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Create policy for product_categories if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'product_categories' 
    AND policyname = 'Anyone can view product categories'
  ) THEN
    CREATE POLICY "Anyone can view product categories" 
    ON public.product_categories 
    FOR SELECT 
    USING (true);
  END IF;
END $$;

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_productos_nombre_search ON productos USING gin(to_tsvector('spanish', nombre));
CREATE INDEX IF NOT EXISTS idx_productos_keywords ON productos USING gin(to_tsvector('spanish', keywords));
CREATE INDEX IF NOT EXISTS idx_productos_category ON productos(category_id);
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id);