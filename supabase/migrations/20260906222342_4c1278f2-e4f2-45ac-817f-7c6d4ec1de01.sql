CREATE OR REPLACE FUNCTION public.stp_tope_mensual(_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _udis integer; _udi numeric; _base numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT COALESCE(monthly_limit_udis, 0) INTO _udis FROM public.qard_identidad WHERE user_id = _user_id;
  SELECT COALESCE(valor_udi_mxn, 8.60) INTO _udi FROM public.stp_config WHERE id;
  SELECT tope INTO _base FROM public.qard_limite_recarga(_user_id);
  IF COALESCE(_udis,0) > 0 THEN
    IF _base IS NULL THEN RETURN _udis * _udi; END IF;
    RETURN LEAST(_base, _udis * _udi);
  END IF;
  RETURN _base;
END;
$$;
REVOKE ALL ON FUNCTION public.stp_tope_mensual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stp_tope_mensual(uuid) TO authenticated, service_role;