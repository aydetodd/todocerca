-- Crear función para obtener email del usuario por user_id de forma segura
CREATE OR REPLACE FUNCTION public.get_user_email_by_id(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Obtener email del usuario desde auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN user_email;
END;
$$;

COMMENT ON FUNCTION public.get_user_email_by_id IS 'Función segura para obtener el email de un usuario por su ID para login';