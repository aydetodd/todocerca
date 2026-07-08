
-- Restaurar columnas cvv_dinamico (4 dígitos, para recibir transferencias)
ALTER TABLE public.qard_wallets ADD COLUMN IF NOT EXISTS cvv_dinamico text;
ALTER TABLE public.qard_sub_qr ADD COLUMN IF NOT EXISTS cvv_dinamico text;

CREATE OR REPLACE FUNCTION public.gen_cvv4()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT lpad(floor(random()*10000)::int::text, 4, '0')
$$;

UPDATE public.qard_wallets SET cvv_dinamico = public.gen_cvv4() WHERE cvv_dinamico IS NULL;
UPDATE public.qard_sub_qr SET cvv_dinamico = public.gen_cvv4() WHERE cvv_dinamico IS NULL;

CREATE OR REPLACE FUNCTION public.tg_set_cvv_default()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cvv_dinamico IS NULL THEN
    NEW.cvv_dinamico := public.gen_cvv4();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wallets_cvv_default ON public.qard_wallets;
CREATE TRIGGER trg_wallets_cvv_default
  BEFORE INSERT ON public.qard_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_cvv_default();

DROP TRIGGER IF EXISTS trg_subqr_cvv_default ON public.qard_sub_qr;
CREATE TRIGGER trg_subqr_cvv_default
  BEFORE INSERT ON public.qard_sub_qr
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_cvv_default();

-- RPC P2P: valida contra cvv_dinamico (4 dígitos) y rota ese CVV, NO el de compras
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
  v_to_sub_index int; v_to_cvv_din text;
  v_new_cvv text;
  v_from_new_saldo numeric;
  v_to_new_saldo numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida'); END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF _from_numero16 IS NULL OR _to_numero16 IS NULL OR _cvv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan datos');
  END IF;
  IF _from_numero16 = _to_numero16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes transferirte a ti mismo');
  END IF;

  -- ORIGEN: QaRd del usuario autenticado
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

  -- DESTINO + su CVV dinámico
  SELECT s.id, s.wallet_id, s.sub_index, s.cvv_dinamico, w.titular_user_id
    INTO v_to_sub_id, v_to_wallet_id, v_to_sub_index, v_to_cvv_din, v_to_titular
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _to_numero16
  LIMIT 1;

  IF v_to_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;
  IF v_to_cvv_din IS NULL OR v_to_cvv_din <> _cvv THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico incorrecto');
  END IF;

  v_new_cvv := public.gen_cvv4();

  -- Debitar ORIGEN
  IF v_from_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id;
  END IF;

  -- Acreditar DESTINO + rotar cvv_dinamico (el de compras NO se toca)
  IF v_to_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv
      WHERE id = v_to_wallet_id
      RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_sub_qr SET cvv_dinamico = v_new_cvv WHERE id = v_to_sub_id;
  ELSE
    UPDATE public.qard_sub_qr
       SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv
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

  -- Aviso interno al receptor con nuevo CVV dinámico
  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    v_to_titular,
    format(E'💸 Recibiste una transferencia\n\nMonto: $%s MXN\nCuenta •••• %s\n\n🔐 Tu nuevo CVV dinámico (para recibir) es: %s\n(Cambia automáticamente tras cada transferencia recibida. El CVV de 3 dígitos para tus compras NO cambia)',
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
