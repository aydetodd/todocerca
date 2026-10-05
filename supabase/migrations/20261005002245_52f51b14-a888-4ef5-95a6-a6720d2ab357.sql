ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tipo_proveedor text;

CREATE OR REPLACE FUNCTION public.set_tipo_proveedor(_tipo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tipo NOT IN ('concesionario','anexo_escuela','oficios','gasolinera','otro') THEN
    RAISE EXCEPTION 'Tipo de proveedor no válido';
  END IF;
  SELECT * INTO _p FROM public.profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
  IF _p.role::text = 'admin' THEN
    UPDATE public.profiles SET tipo_proveedor = _tipo WHERE user_id = _uid;
  ELSE
    UPDATE public.profiles SET tipo_proveedor = _tipo, role = 'proveedor' WHERE user_id = _uid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE user_id = _uid) THEN
    INSERT INTO public.proveedores (user_id, nombre, telefono)
    VALUES (_uid, COALESCE(NULLIF(_p.nombre, ''), 'Proveedor'), _p.phone);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tipo_proveedor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tipo_proveedor(text) TO authenticated, service_role;