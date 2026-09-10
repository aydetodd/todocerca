CREATE OR REPLACE FUNCTION public.qard_limite_recarga(_user_id uuid)
RETURNS TABLE(estado text, tope numeric, usado numeric, disponible numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _estado text;
  _udis integer;
  _udi numeric;
  _tope numeric;
  _usado numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT i.estado, COALESCE(i.monthly_limit_udis, 0)
    INTO _estado, _udis
  FROM public.qard_identidad i
  WHERE i.user_id = _user_id;

  _estado := COALESCE(_estado, 'inactive');

  SELECT COALESCE(c.valor_udi_mxn, 8.60)
    INTO _udi
  FROM public.stp_config c
  WHERE c.id
  LIMIT 1;
  _udi := COALESCE(_udi, 8.60);

  IF _estado = 'moral_approved' THEN
    _tope := NULL;
  ELSIF _udis > 0 THEN
    _tope := round(_udis * _udi, 2);
  ELSE
    _tope := 0;
  END IF;

  _usado := public.qard_entradas_mes(_user_id);

  RETURN QUERY
  SELECT _estado,
         _tope,
         _usado,
         CASE WHEN _tope IS NULL THEN NULL ELSE GREATEST(_tope - _usado, 0) END;
END;
$function$;

REVOKE ALL ON FUNCTION public.qard_limite_recarga(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qard_limite_recarga(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stp_tope_mensual(_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tope numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT l.tope INTO _tope
  FROM public.qard_limite_recarga(_user_id) l;

  RETURN _tope;
END;
$function$;

REVOKE ALL ON FUNCTION public.stp_tope_mensual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stp_tope_mensual(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.qard_limite_cobros(_user_id uuid)
RETURNS TABLE(estado text, tope numeric, usado numeric, disponible numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _estado text;
  _tope numeric;
  _usado numeric;
BEGIN
  SELECT l.estado, l.tope
    INTO _estado, _tope
  FROM public.qard_limite_recarga(_user_id) l;

  _usado := public.qard_entradas_mes(_user_id);

  RETURN QUERY
  SELECT _estado,
         _tope,
         _usado,
         CASE WHEN _tope IS NULL THEN NULL ELSE GREATEST(_tope - _usado, 0) END;
END;
$function$;

REVOKE ALL ON FUNCTION public.qard_limite_cobros(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qard_limite_cobros(uuid) TO authenticated, service_role;