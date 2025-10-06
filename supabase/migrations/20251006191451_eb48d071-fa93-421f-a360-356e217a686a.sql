-- Agregar columna email a la tabla profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Crear índice para búsquedas rápidas por email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);