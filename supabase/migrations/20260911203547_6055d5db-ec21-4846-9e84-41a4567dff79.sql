
-- Monto fijo de apertura: $20
ALTER TABLE public.qard_identidad ALTER COLUMN account_opening_fee_amount SET DEFAULT 20.00;
UPDATE public.qard_identidad SET account_opening_fee_amount = 20.00 WHERE account_opening_fee_pending IS TRUE;

-- Lógica única de acreditación con comisiones (usada por Stripe y por SPEI)
CREATE OR REPLACE FUNCTION public.qard_aplicar_recarga(
  _user_id uuid,
  _monto numeric,
  _origen text,
  _referencia text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet uuid; v_saldo numeric; v_qard text;
  v_pendiente boolean := true;
  v_apertura numeric := 0;
  v_recarga_fee numeric := 5.00;
  v_neto numeric;
BEGIN
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  END IF;

  SELECT qard_number INTO v_qard FROM public.profiles WHERE user_id = _user_id;

  SELECT COALESCE(account_opening_fee_pending, true) INTO v_pendiente
  FROM public.qard_identidad WHERE user_id = _user_id;
  IF NOT FOUND THEN v_pendiente := true; END IF;

  IF v_pendiente THEN v_apertura := 20.00; END IF;

  v_neto := _monto - v_apertura - v_recarga_fee;
  IF v_neto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'monto_menor_a_comisiones',
                              'comisiones', v_apertura + v_recarga_fee);
  END IF;

  v_wallet := public.qard_ensure_wallet(_user_id);
  UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + v_neto, updated_at = now()
   WHERE id = v_wallet RETURNING saldo_mxn INTO v_saldo;

  INSERT INTO public.qard_movimientos(
    wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, comision_mxn, descripcion, metadata
  ) VALUES (
    v_wallet, _user_id, 'recarga', v_neto, v_saldo, v_apertura + v_recarga_fee,
    'Recarga ' || COALESCE(_origen,'') || ' $' || to_char(_monto,'FM999999990.00') || ' MXN (neto acreditado)',
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object(
      'origen', _origen, 'referencia', _referencia, 'monto_transferido', _monto,
      'apertura', v_apertura, 'comision_recarga', v_recarga_fee, 'neto_acreditado', v_neto)
  );

  IF v_apertura > 0 THEN
    PERFORM public.qard_cobrar_comision(_user_id, 'account_opening', v_apertura, _monto, NULL,
      'Activación de QaRd', _referencia, v_qard);
    UPDATE public.qard_identidad
       SET account_opening_fee_pending = false, account_opening_fee_amount = 20.00, updated_at = now()
     WHERE user_id = _user_id;
  END IF;

  PERFORM public.qard_cobrar_comision(_user_id, 'reload_fee', v_recarga_fee, _monto, NULL,
    'Comisión por recarga (' || COALESCE(_origen,'') || ')', _referencia, v_qard);

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'monto', _monto,
    'apertura', v_apertura, 'comision_recarga', v_recarga_fee, 'total_comisiones', v_apertura + v_recarga_fee,
    'neto', v_neto, 'saldo', v_saldo, 'primera_recarga', v_apertura > 0);
END; $function$;

REVOKE ALL ON FUNCTION public.qard_aplicar_recarga(uuid, numeric, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_aplicar_recarga(uuid, numeric, text, text, jsonb) TO service_role;

-- SPEI ahora reutiliza la misma lógica
CREATE OR REPLACE FUNCTION public.stp_procesar_deposito(
  _clave_rastreo text, _monto numeric, _concepto text,
  _clabe_destino text DEFAULT NULL, _clabe_ordenante text DEFAULT NULL,
  _nombre_ordenante text DEFAULT NULL, _banco_ordenante text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dep public.stp_depositos%ROWTYPE;
  v_qard text; v_user uuid; v_tope numeric; v_usado numeric; v_res jsonb;
BEGIN
  IF _clave_rastreo IS NULL OR length(trim(_clave_rastreo)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clave_rastreo_faltante');
  END IF;
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  END IF;

  SELECT * INTO v_dep FROM public.stp_depositos WHERE clave_rastreo = _clave_rastreo;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true, 'deposito_id', v_dep.id, 'estado', v_dep.estado);
  END IF;

  v_qard := substring(regexp_replace(COALESCE(_concepto,''), '[^0-9]', '', 'g') FROM '\d{16}');

  INSERT INTO public.stp_depositos(
    clave_rastreo, qard_number, monto_mxn, concepto, clabe_destino,
    clabe_ordenante, nombre_ordenante, banco_ordenante, stp_response, estado
  ) VALUES (
    _clave_rastreo, v_qard, _monto, _concepto, _clabe_destino,
    _clabe_ordenante, _nombre_ordenante, _banco_ordenante, COALESCE(_payload,'{}'::jsonb), 'pending'
  ) RETURNING * INTO v_dep;

  IF v_qard IS NULL THEN
    UPDATE public.stp_depositos SET estado='unmatched', motivo='concepto_sin_qard', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'concepto_sin_qard');
  END IF;

  SELECT user_id INTO v_user FROM public.profiles WHERE qard_number = v_qard;
  IF v_user IS NULL THEN
    UPDATE public.stp_depositos SET estado='unmatched', motivo='qard_no_encontrada', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'qard_no_encontrada', 'qard', v_qard);
  END IF;

  UPDATE public.stp_depositos SET user_id = v_user WHERE id = v_dep.id;

  v_tope := public.stp_tope_mensual(v_user);
  v_usado := public.qard_recargas_mes(v_user);
  IF v_tope IS NOT NULL AND (v_usado + _monto) > v_tope THEN
    UPDATE public.stp_depositos SET estado='rejected', motivo='excede_tope_mensual', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'excede_tope_mensual',
                              'tope', v_tope, 'usado', v_usado, 'user_id', v_user);
  END IF;

  v_res := public.qard_aplicar_recarga(
    v_user, _monto, 'SPEI', _clave_rastreo,
    jsonb_build_object('ordenante', _nombre_ordenante, 'banco', _banco_ordenante));

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    UPDATE public.stp_depositos SET estado='rejected', motivo=COALESCE(v_res->>'motivo','error'), procesado_at=now()
     WHERE id=v_dep.id;
    RETURN v_res || jsonb_build_object('deposito_id', v_dep.id, 'user_id', v_user);
  END IF;

  UPDATE public.stp_depositos SET estado='completed', procesado_at=now() WHERE id=v_dep.id;

  RETURN v_res || jsonb_build_object('deposito_id', v_dep.id, 'qard', v_qard);
END; $function$;
