-- Add provider_type enum and column to profiles
CREATE TYPE public.provider_type AS ENUM ('taxi', 'ruta');

ALTER TABLE public.profiles 
ADD COLUMN provider_type public.provider_type DEFAULT NULL;

-- Add route_name column for bus drivers to specify their route (e.g., "Ruta 1", "Ruta 2")
ALTER TABLE public.profiles 
ADD COLUMN route_name text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.provider_type IS 'Type of provider: taxi or ruta (bus/public transport)';
COMMENT ON COLUMN public.profiles.route_name IS 'Route name for public transport providers (e.g., Ruta 1, Ruta 2)';