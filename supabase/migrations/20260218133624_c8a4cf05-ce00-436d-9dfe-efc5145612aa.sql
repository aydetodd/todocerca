
-- Add linea_numero column to rutas_catalogo for the "Línea X" dropdown
ALTER TABLE public.rutas_catalogo ADD COLUMN IF NOT EXISTS linea_numero integer;
ALTER TABLE public.rutas_catalogo ADD COLUMN IF NOT EXISTS nombre_ruta text;

-- Update existing records to split linea_numero and nombre_ruta
UPDATE public.rutas_catalogo SET linea_numero = 1, nombre_ruta = 'Manga' WHERE nombre = 'Línea 1 - Manga';
UPDATE public.rutas_catalogo SET linea_numero = 2, nombre_ruta = 'Solidaridad' WHERE nombre = 'Línea 2 - Solidaridad';
UPDATE public.rutas_catalogo SET linea_numero = 3, nombre_ruta = 'Poblado Miguel Alemán' WHERE nombre = 'Línea 3 - Poblado Miguel Alemán';
UPDATE public.rutas_catalogo SET linea_numero = 4, nombre_ruta = 'Real del Arco' WHERE nombre = 'Línea 4 - Real del Arco';
UPDATE public.rutas_catalogo SET linea_numero = 5, nombre_ruta = 'Villa Satélite' WHERE nombre = 'Línea 5 - Villa Satélite';

-- Insert more Hermosillo routes
INSERT INTO public.rutas_catalogo (nombre, tipo, pais, estado, ciudad, nombre_ruta, linea_numero, descripcion) VALUES
('Línea 6 - Sahuaro', 'publico', 'MX', 'Sonora', 'Hermosillo', 'Sahuaro', 6, 'Ruta Sahuaro'),
('Línea 7 - Palo Verde', 'publico', 'MX', 'Sonora', 'Hermosillo', 'Palo Verde', 7, 'Ruta Palo Verde'),
('Línea 8 - Olivares', 'publico', 'MX', 'Sonora', 'Hermosillo', 'Olivares', 8, 'Ruta Olivares'),
('Línea 9 - Pueblitos', 'publico', 'MX', 'Sonora', 'Hermosillo', 'Pueblitos', 9, 'Ruta Pueblitos'),
('Línea 10 - Las Lomas', 'publico', 'MX', 'Sonora', 'Hermosillo', 'Las Lomas', 10, 'Ruta Las Lomas');
