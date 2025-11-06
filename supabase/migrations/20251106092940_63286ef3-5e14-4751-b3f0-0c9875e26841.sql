-- Crear función para normalizar números de teléfono (solo dígitos)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(phone, '[^0-9]', '', 'g')
$$;

COMMENT ON FUNCTION public.normalize_phone IS 'Normaliza un número de teléfono eliminando todos los caracteres no numéricos';

-- Crear función para buscar usuario por teléfono de forma flexible
CREATE OR REPLACE FUNCTION public.find_user_by_phone(phone_param TEXT)
RETURNS TABLE(user_id UUID, phone TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id, p.telefono
  FROM profiles p
  WHERE normalize_phone(p.telefono) = normalize_phone(phone_param)
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_user_by_phone IS 'Busca un usuario por teléfono de forma flexible, normalizando ambos números para comparar solo dígitos';