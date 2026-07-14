
-- 1) Sincronizar cvv_dinamico entre wallet principal y su fila sub_index=0
UPDATE public.qard_sub_qr s
SET cvv_dinamico = w.cvv_dinamico
FROM public.qard_wallets w
WHERE s.wallet_id = w.id
  AND s.sub_index = 0
  AND w.cvv_dinamico IS NOT NULL
  AND (s.cvv_dinamico IS DISTINCT FROM w.cvv_dinamico);

-- 2) Recrear qard_transfer_p2p con soporte para todas las variantes
CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(
  _from_numero16 text, _to_numero16 text, _cvv text, _monto numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_from_sub_id uuid; v_from_wallet_id uuid; v_from_titular uuid;
  v_from_sub_index int; v_from_sub_saldo numeric; v_from_wallet_saldo numeric;
  v_to_sub_id uuid; v_to_wallet_id uuid; v_to_titular uuid;
  v_to_sub_index int; v_to_cvv_sub text; v_to_cvv_wallet text; v_to_cvv_expected text;
  v_new_cvv text;
  v_from_new_saldo numeric;
  v_to_new_saldo numeric;
  v_same_owner boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida'); END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF _from_numero16 IS NULL OR _to_numero16 IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan datos');
  END IF;
  IF _from_numero16 = _to_numero16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Origen y destino son la misma cuenta');
  END IF;

  -- ORIGEN: debe pertenecer al usuario autenticado
  SELECT s.id, s.wallet_id, s.sub_index, s.saldo_mxn, w.titular_user_id, w.saldo_mxn
    INTO v_from_sub_id, v_from_wallet_id, v_from_sub_index, v_from_sub_saldo, v_from_titular, v_from_wallet_saldo
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _from_numero16 AND w.titular_user_id = v_uid
  LIMIT 1;

  IF v_from_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta origen no te pertenece');
  END IF;

  IF v_from_sub_index = 0 THEN
    IF v_from_wallet_saldo < _monto THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  ELSE
    IF v_from_sub_saldo < _monto THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en sub-QR');
    END IF;
  END IF;

  -- DESTINO
  SELECT s.id, s.wallet_id, s.sub_index, s.cvv_dinamico, w.titular_user_id, w.cvv_dinamico
    INTO v_to_sub_id, v_to_wallet_id, v_to_sub_index, v_to_cvv_sub, v_to_titular, v_to_cvv_wallet
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _to_numero16
  LIMIT 1;

  IF v_to_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;

  v_same_owner := (v_to_titular = v_uid);

  -- CVV solo requerido si el destino NO es del mismo dueño
  IF NOT v_same_owner THEN
    v_to_cvv_expected := CASE WHEN v_to_sub_index = 0 THEN COALESCE(v_to_cvv_wallet, v_to_cvv_sub) ELSE v_to_cvv_sub END;
    IF _cvv IS NULL OR length(regexp_replace(_cvv, '\D', '', 'g')) <> 4 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico requerido (4 dígitos)');
    END IF;
    IF v_to_cvv_expected IS NULL OR v_to_cvv_expected <> regexp_replace(_cvv, '\D', '', 'g') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico incorrecto');
    END IF;
  END IF;

  v_new_cvv := public.gen_cvv4();

  -- Debitar ORIGEN
  IF v_from_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id;
  END IF;

  -- Acreditar DESTINO + rotar cvv dinámico (solo si NO es mismo dueño, para no molestar al usuario)
  IF v_to_sub_index = 0 THEN
    UPDATE public.qard_wallets
       SET saldo_mxn = saldo_mxn + _monto,
           cvv_dinamico = CASE WHEN v_same_owner THEN cvv_dinamico ELSE v_new_cvv END
     WHERE id = v_to_wallet_id
     RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_sub_qr
       SET saldo_mxn = saldo_mxn + _monto,
           cvv_dinamico = CASE WHEN v_same_owner THEN cvv_dinamico ELSE v_new_cvv END
     WHERE id = v_to_sub_id;
  ELSE
    UPDATE public.qard_sub_qr
       SET saldo_mxn = saldo_mxn + _monto,
           cvv_dinamico = CASE WHEN v_same_owner THEN cvv_dinamico ELSE v_new_cvv END
     WHERE id = v_to_sub_id
     RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto WHERE id = v_to_wallet_id;
  END IF;

  -- Movimientos
  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_from_wallet_id, v_from_titular,
          CASE WHEN v_from_sub_index = 0 THEN NULL ELSE v_from_sub_id END,
          'transferencia_p2p_out', _monto, v_from_new_saldo,
          format('Transferencia enviada a %s', right(_to_numero16, 4)), 'Transferencia P2P');

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_to_wallet_id, v_to_titular,
          CASE WHEN v_to_sub_index = 0 THEN NULL ELSE v_to_sub_id END,
          'transferencia_p2p_in', _monto, v_to_new_saldo,
          format('Transferencia recibida de %s', right(_from_numero16, 4)), 'Transferencia P2P');

  RETURN jsonb_build_object(
    'ok', true,
    'monto', _monto,
    'saldo_origen', v_from_new_saldo,
    'saldo_destino', v_to_new_saldo,
    'nuevo_cvv_destino', CASE WHEN v_same_owner THEN NULL ELSE v_new_cvv END,
    'mismo_dueno', v_same_owner
  );
END;
$function$;
