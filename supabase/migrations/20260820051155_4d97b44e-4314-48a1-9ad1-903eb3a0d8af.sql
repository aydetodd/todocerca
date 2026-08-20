CREATE OR REPLACE FUNCTION public.rpc_registrar_punto_traza(_target_qard text, _lat double precision, _lng double precision, _tipo text DEFAULT 'testigo', _lugar text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_sub uuid;
  v_alias text;
  v_activa boolean;
  v_nombre text;
  v_receptor text;
  v_etiqueta text;
  v_es_mio boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT user_id INTO v_user FROM public.profiles WHERE qard_number = _target_qard LIMIT 1;

  IF v_user IS NULL THEN
    SELECT s.titular_user_id, s.id, s.alias INTO v_user, v_sub, v_alias
    FROM public.qard_sub_qr s WHERE s.qard_number = _target_qard LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No encontré esa tarjeta QaRd');
  END IF;

  SELECT p.trazabilidad_activa, p.nombre INTO v_activa, v_nombre
  FROM public.profiles p WHERE p.user_id = v_user;

  v_es_mio := (v_user = auth.uid());

  v_etiqueta := CASE
    WHEN v_sub IS NOT NULL THEN COALESCE(v_nombre, 'QaRd') || ' · ' || COALESCE(NULLIF(v_alias, ''), 'Sub-QR') || ' ·' || right(_target_qard, 4)
    ELSE COALESCE(v_nombre, 'QaRd') || ' · Cuenta eje ·' || right(_target_qard, 4)
  END;

  IF COALESCE(v_activa, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa persona tiene la trazabilidad desactivada', 'nombre', v_nombre, 'etiqueta', v_etiqueta, 'es_sub', v_sub IS NOT NULL, 'es_mio', v_es_mio);
  END IF;

  SELECT nombre INTO v_receptor FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.trazabilidad_puntos (user_id, sub_qr_id, lat, lng, tipo_evento, receptor_id, receptor_nombre, lugar)
  VALUES (v_user, v_sub, _lat, _lng, COALESCE(_tipo, 'testigo'), auth.uid()::text, v_receptor, _lugar);

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre, 'etiqueta', v_etiqueta, 'es_sub', v_sub IS NOT NULL, 'es_mio', v_es_mio);
END;
$$;