
-- Catálogo de rutas predefinidas (públicas y foráneas)
CREATE TABLE public.rutas_catalogo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('publico', 'foraneo')),
  descripcion TEXT,
  ciudad TEXT,
  estado TEXT,
  pais VARCHAR DEFAULT 'MX',
  geojson_file TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rutas_catalogo ENABLE ROW LEVEL SECURITY;

-- Everyone can view active routes
CREATE POLICY "Anyone can view active rutas_catalogo"
  ON public.rutas_catalogo FOR SELECT
  USING (is_active = true);

-- Admins can manage
CREATE POLICY "Admins can manage rutas_catalogo"
  ON public.rutas_catalogo FOR ALL
  USING (is_admin());

-- Add transport_type to unidades_empresa to distinguish unit type
ALTER TABLE public.unidades_empresa 
  ADD COLUMN IF NOT EXISTS transport_type TEXT DEFAULT 'privado' CHECK (transport_type IN ('publico', 'foraneo', 'privado')),
  ADD COLUMN IF NOT EXISTS marca TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS numero_economico TEXT;

-- Seed initial UNE Hermosillo routes
INSERT INTO public.rutas_catalogo (nombre, tipo, descripcion, ciudad, estado, pais, geojson_file) VALUES
  ('Línea 1 - Manga', 'publico', 'Ruta Manga', 'Hermosillo', 'Sonora', 'MX', 'L1_MANGA.geojson'),
  ('Línea 2 - Solidaridad', 'publico', 'Ruta Solidaridad', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Línea 3 - Poblado Miguel Alemán', 'publico', 'Ruta PMA', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Línea 4 - Real del Arco', 'publico', 'Ruta Real del Arco', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Línea 5 - Villa Satélite', 'publico', 'Ruta Villa Satélite', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Hermosillo - Guaymas', 'foraneo', 'Ruta foránea Hermosillo-Guaymas', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Hermosillo - Obregón', 'foraneo', 'Ruta foránea Hermosillo-Obregón', 'Hermosillo', 'Sonora', 'MX', NULL),
  ('Hermosillo - Nogales', 'foraneo', 'Ruta foránea Hermosillo-Nogales', 'Hermosillo', 'Sonora', 'MX', NULL);

-- Trigger for updated_at
CREATE TRIGGER update_rutas_catalogo_updated_at
  BEFORE UPDATE ON public.rutas_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
