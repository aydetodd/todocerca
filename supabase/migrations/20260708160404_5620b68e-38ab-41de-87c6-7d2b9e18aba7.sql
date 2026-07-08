
-- 1. Agregar cvv_dinamico a wallets y sub_qr
ALTER TABLE public.qard_wallets
  ADD COLUMN IF NOT EXISTS cvv_dinamico text;

ALTER TABLE public.qard_sub_qr
  ADD COLUMN IF NOT EXISTS cvv_dinamico text;

-- Función helper para generar CVV de 4 dígitos
CREATE OR REPLACE FUNCTION public.gen_cvv4()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT lpad(floor(random()*10000)::int::text, 4, '0')
$$;

-- Backfill CVVs faltantes
UPDATE public.qard_wallets SET cvv_dinamico = public.gen_cvv4() WHERE cvv_dinamico IS NULL;
UPDATE public.qard_sub_qr SET cvv_dinamico = public.gen_cvv4() WHERE cvv_dinamico IS NULL;

-- Trigger para asignar CVV al crear
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

-- 2. RPC transferencia P2P
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
  v_from_wallet_id uuid; v_from_titular uuid; v_from_saldo numeric; v_from_es_sub boolean := false; v_from_sub_id uuid;
  v_to_wallet_id uuid; v_to_titular uuid; v_to_saldo numeric; v_to_es_sub boolean := false; v_to_sub_id uuid;
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

  -- Resolver ORIGEN: wallet directa o sub_qr, DEBE pertenecer al usuario autenticado
  SELECT w.id, w.titular_user_id, w.saldo_mxn
    INTO v_from_wallet_id, v_from_titular, v_from_saldo
  FROM public.qard_wallets w
  JOIN public.profiles p ON p.user_id = w.titular_user_id
  WHERE p.qard_number = _from_numero16 AND w.titular_user_id = v_uid
  LIMIT 1;

  IF v_from_wallet_id IS NULL THEN
    SELECT s.id, s.wallet_id, w.titular_user_id, w.saldo_mxn
      INTO v_from_sub_id, v_from_wallet_id, v_from_titular, v_from_saldo
    FROM public.qard_sub_qr s
    JOIN public.qard_wallets w ON w.id = s.wallet_id
    WHERE s.qard_number = _from_numero16 AND w.titular_user_id = v_uid
    LIMIT 1;
    IF v_from_sub_id IS NOT NULL THEN v_from_es_sub := true; END IF;
  END IF;

  IF v_from_wallet_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta origen no te pertenece');
  END IF;
  IF v_from_saldo < _monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
  END IF;

  -- Resolver DESTINO: wallet o sub_qr
  SELECT w.id, w.titular_user_id, w.saldo_mxn, w.cvv_dinamico
    INTO v_to_wallet_id, v_to_titular, v_to_saldo, v_to_cvv
  FROM public.qard_wallets w
  JOIN public.profiles p ON p.user_id = w.titular_user_id
  WHERE p.qard_number = _to_numero16
  LIMIT 1;

  IF v_to_wallet_id IS NULL THEN
    SELECT s.id, s.wallet_id, w.titular_user_id, w.saldo_mxn, s.cvv_dinamico
      INTO v_to_sub_id, v_to_wallet_id, v_to_titular, v_to_saldo, v_to_cvv
    FROM public.qard_sub_qr s
    JOIN public.qard_wallets w ON w.id = s.wallet_id
    WHERE s.qard_number = _to_numero16
    LIMIT 1;
    IF v_to_sub_id IS NOT NULL THEN v_to_es_sub := true; END IF;
  END IF;

  IF v_to_wallet_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;
  IF v_to_cvv IS NULL OR v_to_cvv <> _cvv THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CVV incorrecto');
  END IF;

  v_new_cvv := public.gen_cvv4();

  -- Debitar origen
  IF v_from_es_sub THEN
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id;
  END IF;
  UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
    RETURNING saldo_mxn INTO v_from_new_saldo;

  -- Acreditar destino + rotar CVV
  IF v_to_es_sub THEN
    UPDATE public.qard_sub_qr
       SET saldo_mxn = saldo_mxn + _monto,
           cvv_dinamico = v_new_cvv
     WHERE id = v_to_sub_id;
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto WHERE id = v_to_wallet_id
      RETURNING saldo_mxn INTO v_to_new_saldo;
  ELSE
    UPDATE public.qard_wallets
       SET saldo_mxn = saldo_mxn + _monto,
           cvv_dinamico = v_new_cvv
     WHERE id = v_to_wallet_id
     RETURNING saldo_mxn INTO v_to_new_saldo;
  END IF;

  -- Movimientos
  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_from_wallet_id, v_from_titular, 'transferencia_p2p_out', _monto, v_from_new_saldo,
          format('Transferencia enviada a %s', right(_to_numero16, 4)), 'Transferencia P2P');

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_to_wallet_id, v_to_titular, 'transferencia_p2p_in', _monto, v_to_new_saldo,
          format('Transferencia recibida de %s', right(_from_numero16, 4)), 'Transferencia P2P');

  -- Aviso interno al receptor con nuevo CVV
  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    v_to_titular,
    format(E'💸 Recibiste una transferencia\n\nMonto: $%s MXN\nCuenta: %s\n\n🔐 Tu nuevo CVV dinámico es: %s\n(Cambia automáticamente tras cada uso para tu seguridad)',
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
