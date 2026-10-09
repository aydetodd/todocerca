CREATE OR REPLACE FUNCTION public.registrar_concesionario()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _p record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
  UPDATE public.profiles SET
    role = CASE WHEN role::text IN ('admin','proveedor') THEN role ELSE 'proveedor' END,
    tipo_proveedor = COALESCE(tipo_proveedor, 'concesionario')
  WHERE user_id = _uid;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE user_id = _uid) THEN
    INSERT INTO public.proveedores (user_id, nombre, telefono)
    VALUES (_uid, COALESCE(NULLIF(_p.apodo,''), NULLIF(_p.nombre,''), 'Concesionario'), _p.phone);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.registrar_concesionario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_concesionario() TO authenticated;