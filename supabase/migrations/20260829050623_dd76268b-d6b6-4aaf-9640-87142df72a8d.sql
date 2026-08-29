ALTER TABLE public.qard_wallets
  ADD COLUMN IF NOT EXISTS saldo_comercio_mxn numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.qard_pasar_cobros_a_eje(_monto numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _w record;
  _nuevo_com numeric;
  _nuevo_eje numeric;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido');
  END IF;

  SELECT * INTO _w FROM public.qard_wallets WHERE titular_user_id = _uid FOR UPDATE;
  IF _w IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes billetera');
  END IF;
  IF COALESCE(_w.saldo_comercio_mxn, 0) < _monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo de cobros insuficiente');
  END IF;

  _nuevo_com := ROUND(COALESCE(_w.saldo_comercio_mxn, 0) - _monto, 2);
  _nuevo_eje := ROUND(COALESCE(_w.saldo_mxn, 0) + _monto, 2);

  UPDATE public.qard_wallets
     SET saldo_comercio_mxn = _nuevo_com,
         saldo_mxn = _nuevo_eje
   WHERE id = _w.id;

  UPDATE public.qard_sub_qr
     SET saldo_mxn = _nuevo_eje
   WHERE wallet_id = _w.id AND sub_index = 0;

  INSERT INTO public.qard_movimientos
    (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, comercio_user_id,
     comision_mxn, neto_comercio_mxn, descripcion, metadata)
  VALUES
    (_w.id, _uid, 'traspaso_cobros_out', _monto, _nuevo_com, _uid,
     0, -_monto, 'Traspaso de cobros a cuenta eje', jsonb_build_object('lado', 'cargo', 'bolsa', 'comercio')),
    (_w.id, _uid, 'traspaso_cobros_in', _monto, _nuevo_eje, NULL,
     0, 0, 'Traspaso recibido de cobros', jsonb_build_object('lado', 'abono', 'bolsa', 'eje'));

  RETURN jsonb_build_object('ok', true, 'saldo_comercio', _nuevo_com, 'saldo_eje', _nuevo_eje);
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_pasar_cobros_a_eje(numeric) TO authenticated;