ALTER TABLE public.qard_moral_solicitudes
  ADD COLUMN IF NOT EXISTS tipo_persona text NOT NULL DEFAULT 'moral',
  ADD COLUMN IF NOT EXISTS nombre_completo text,
  ADD COLUMN IF NOT EXISTS curp_enc text,
  ADD COLUMN IF NOT EXISTS suscripcion_mxn numeric NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS suscripcion_vence timestamptz;

CREATE OR REPLACE FUNCTION public.qard_entradas_mes(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT SUM(m.monto_mxn) FROM public.qard_movimientos m
    WHERE m.titular_user_id = _user_id
      AND m.tipo IN ('recarga','transferencia_p2p_in')
      AND (m.created_at AT TIME ZONE 'America/Hermosillo')
          >= date_trunc('month', (now() AT TIME ZONE 'America/Hermosillo'))
  ), 0)::numeric
  + COALESCE((
    SELECT SUM(GREATEST(COALESCE(m.neto_comercio_mxn, m.monto_mxn), 0)) FROM public.qard_movimientos m
    WHERE m.comercio_user_id = _user_id
      AND m.tipo = 'cobro_comercio'
      AND (m.created_at AT TIME ZONE 'America/Hermosillo')
          >= date_trunc('month', (now() AT TIME ZONE 'America/Hermosillo'))
  ), 0)::numeric;
$function$;

CREATE OR REPLACE FUNCTION public.qard_limite_recarga(_user_id uuid)
RETURNS TABLE(estado text, tope numeric, usado numeric, disponible numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _estado text;
  _tope numeric;
  _usado numeric;
BEGIN
  SELECT i.estado INTO _estado FROM public.qard_identidad i WHERE i.user_id = _user_id;
  _estado := COALESCE(_estado, 'inactive');
  _tope := CASE WHEN _estado = 'moral_approved' THEN NULL ELSE 10000 END;
  _usado := public.qard_entradas_mes(_user_id);
  RETURN QUERY SELECT _estado, _tope, _usado,
    CASE WHEN _tope IS NULL THEN NULL ELSE GREATEST(_tope - _usado, 0) END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.qard_entradas_mes(uuid) TO authenticated, service_role;