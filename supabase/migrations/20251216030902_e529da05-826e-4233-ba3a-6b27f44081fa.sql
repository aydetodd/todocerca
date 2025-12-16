-- Función para agregar contacto bidireccional
CREATE OR REPLACE FUNCTION public.add_bidirectional_contact(
  p_contact_user_id uuid,
  p_nickname text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  -- Obtener el user_id del usuario actual
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;
  
  -- No permitir agregarse a uno mismo
  IF v_current_user_id = p_contact_user_id THEN
    RAISE EXCEPTION 'No puedes agregarte a ti mismo';
  END IF;
  
  -- Insertar contacto del usuario actual hacia el otro
  INSERT INTO user_contacts (user_id, contact_user_id, nickname)
  VALUES (v_current_user_id, p_contact_user_id, p_nickname)
  ON CONFLICT DO NOTHING;
  
  -- Insertar contacto inverso (el otro usuario tiene al actual)
  INSERT INTO user_contacts (user_id, contact_user_id, nickname)
  VALUES (p_contact_user_id, v_current_user_id, NULL)
  ON CONFLICT DO NOTHING;
  
  RETURN true;
END;
$$;