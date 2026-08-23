CREATE OR REPLACE FUNCTION public.ev_aceptar_validador(_token text)
RETURNS SETOF public.ev_validadores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  RETURN QUERY
  UPDATE public.ev_validadores
  SET user_id = _uid, activo = true
  WHERE invite_token = _token
    AND (user_id IS NULL OR user_id = _uid)
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ev_aceptar_validador(text) TO authenticated;