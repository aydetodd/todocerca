
-- Helper CVV 3 dígitos
CREATE OR REPLACE FUNCTION public.gen_cvv3()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT lpad(floor(random()*1000)::int::text, 3, '0')
$$;

-- Reemplazar RPC de transferencia P2P: usa qard_sub_qr.cvv (3 dígitos)
CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(
  _from_numero16 text,
  _to_numero16 text,
  _cvv text,
  _monto numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from_sub_id uuid; v_from_wallet_id uuid; v_from_titular uuid;
  v_from_sub_index int; v_from_sub_saldo numeric; v_from_wallet_saldo numeric;
  v_to_sub_id uuid; v_to_wallet_id uuid; v_to_titular uuid;
  v_to_sub_index int; v_to_sub_saldo numeric; v_to_wallet_saldo numeric;
  v_to_cvv text;
  v_new_cvv text;
  v_from_new_saldo numeric;
  v_to_new_saldo numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida');
  END IF;
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido');
  END IF;
  IF _from_numero16 IS NULL OR _to_numero16 IS NULL OR _cvv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan datos');
  END IF;
  IF _from_numero16 = _to_numero16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes transferirte a ti mismo');
  END IF;

  -- ORIGEN: debe ser una QaRd (principal o sub) del usuario autenticado
  SELECT s.id, s.wallet_id, s.sub_index, s.saldo_mxn, w.titular_user_id, w.saldo_mxn
    INTO v_from_sub_id, v_from_wallet_id, v_from_sub_index, v_from_sub_saldo, v_from_titular, v_from_wallet_saldo
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _from_numero16 AND w.titular_user_id = v_uid
  LIMIT 1;

  IF v_from_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta origen no te pertenece');
  END IF;

  -- Saldo disponible: principal usa wallet, sub usa su propio saldo
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
  SELECT s.id, s.wallet_id, s.sub_index, s.cvv, w.titular_user_id
    INTO v_to_sub_id, v_to_wallet_id, v_to_sub_index, v_to_cvv, v_to_titular
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _to_numero16
  LIMIT 1;

  IF v_to_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;
  IF v_to_cvv IS NULL OR v_to_cvv <> _cvv THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CVV incorrecto');
  END IF;

  v_new_cvv := public.gen_cvv3();

  -- Debitar ORIGEN
  IF v_from_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id;
  END IF;

  -- Acreditar DESTINO + rotar CVV
  IF v_to_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto WHERE id = v_to_wallet_id
      RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_sub_qr SET cvv = v_new_cvv WHERE id = v_to_sub_id;
  ELSE
    UPDATE public.qard_sub_qr
       SET saldo_mxn = saldo_mxn + _monto, cvv = v_new_cvv
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

  -- Aviso interno al receptor con nuevo CVV
  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    v_to_titular,
    format(E'💸 Recibiste una transferencia\n\nMonto: $%s MXN\nCuenta •••• %s\n\n🔐 Tu nuevo CVV es: %s\n(Cambia automáticamente tras cada transferencia recibida para tu seguridad)',
           _monto::text, right(_to_numero16, 4), v_new_cvv),
    false
  );

  RETURN jsonb_build_object(
    'ok', true,
    'monto', _monto,
    'saldo_origen', v_from_new_saldo,
    'destino_ultimos4', right(_to_numero16, 4)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.qard_transfer_p2p(text, text, text, numeric) TO authenticated;

-- Retirar columnas cvv_dinamico (ya no se usan)
ALTER TABLE public.qard_wallets DROP COLUMN IF EXISTS cvv_dinamico;
ALTER TABLE public.qard_sub_qr DROP COLUMN IF EXISTS cvv_dinamico;

-- Limpiar triggers y helper CVV4
DROP TRIGGER IF EXISTS trg_wallets_cvv_default ON public.qard_wallets;
DROP TRIGGER IF EXISTS trg_subqr_cvv_default ON public.qard_sub_qr;
DROP FUNCTION IF EXISTS public.tg_set_cvv_default();
DROP FUNCTION IF EXISTS public.gen_cvv4();
