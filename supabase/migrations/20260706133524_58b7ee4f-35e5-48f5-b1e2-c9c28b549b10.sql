-- 1) Saldo propio por sub-QR
ALTER TABLE public.qard_sub_qr
  ADD COLUMN IF NOT EXISTS saldo_mxn NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2) Transferir saldo entre wallet del titular y un sub-QR
CREATE OR REPLACE FUNCTION public.qard_transferir_a_sub(_sub_qr_id UUID, _monto_mxn NUMERIC)
RETURNS TABLE(saldo_wallet NUMERIC, saldo_sub NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _sub public.qard_sub_qr;
  _wallet public.qard_wallets;
  _nuevo_wallet NUMERIC;
  _nuevo_sub NUMERIC;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _monto_mxn = 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  SELECT * INTO _sub FROM public.qard_sub_qr WHERE id = _sub_qr_id;
  IF _sub.id IS NULL THEN RAISE EXCEPTION 'Sub-QR no encontrada'; END IF;
  IF _sub.titular_user_id <> _uid THEN RAISE EXCEPTION 'No es tu sub-QR'; END IF;
  IF _sub.sub_index = 0 THEN RAISE EXCEPTION 'La tarjeta principal usa el saldo del wallet'; END IF;
  IF _sub.estado = 'cancelada' THEN RAISE EXCEPTION 'Sub-QR cancelada'; END IF;

  SELECT * INTO _wallet FROM public.qard_wallets WHERE id = _sub.wallet_id FOR UPDATE;
  IF _wallet.id IS NULL THEN RAISE EXCEPTION 'Wallet no encontrada'; END IF;

  _nuevo_wallet := ROUND(_wallet.saldo_mxn - _monto_mxn, 2);
  _nuevo_sub    := ROUND(_sub.saldo_mxn    + _monto_mxn, 2);

  IF _monto_mxn > 0 AND _nuevo_wallet < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente en tarjeta principal';
  END IF;
  IF _monto_mxn < 0 AND _nuevo_sub < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente en sub-QR';
  END IF;

  UPDATE public.qard_wallets SET saldo_mxn = _nuevo_wallet WHERE id = _wallet.id;
  UPDATE public.qard_sub_qr  SET saldo_mxn = _nuevo_sub, updated_at = now() WHERE id = _sub.id;

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion)
  VALUES (_wallet.id, _uid, _sub.id,
          CASE WHEN _monto_mxn > 0 THEN 'transfer_a_sub' ELSE 'transfer_desde_sub' END,
          ABS(_monto_mxn), _nuevo_wallet,
          CASE WHEN _monto_mxn > 0
               THEN 'Asignado a sub-QR ' || _sub.alias
               ELSE 'Retirado de sub-QR ' || _sub.alias END);

  RETURN QUERY SELECT _nuevo_wallet, _nuevo_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_transferir_a_sub(UUID, NUMERIC) TO authenticated;

-- 3) Encender / apagar un sub-QR
CREATE OR REPLACE FUNCTION public.qard_sub_set_estado(_sub_qr_id UUID, _estado TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _sub public.qard_sub_qr;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _estado NOT IN ('activa','apagada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;

  SELECT * INTO _sub FROM public.qard_sub_qr WHERE id = _sub_qr_id;
  IF _sub.id IS NULL THEN RAISE EXCEPTION 'Sub-QR no encontrada'; END IF;
  IF _sub.titular_user_id <> _uid THEN RAISE EXCEPTION 'No es tu sub-QR'; END IF;
  IF _sub.estado = 'cancelada' THEN RAISE EXCEPTION 'Sub-QR cancelada'; END IF;

  UPDATE public.qard_sub_qr SET estado = _estado, updated_at = now() WHERE id = _sub_qr_id;
  RETURN _estado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_sub_set_estado(UUID, TEXT) TO authenticated;