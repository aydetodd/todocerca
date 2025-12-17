-- Add estado and ciudad columns to productos table
ALTER TABLE public.productos 
ADD COLUMN estado text DEFAULT NULL,
ADD COLUMN ciudad text DEFAULT NULL;

-- Add index for location-based searches
CREATE INDEX idx_productos_estado_ciudad ON public.productos(estado, ciudad);