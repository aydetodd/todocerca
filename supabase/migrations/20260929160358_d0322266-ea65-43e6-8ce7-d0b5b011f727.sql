ALTER TABLE public.qard_movimientos
  ADD COLUMN IF NOT EXISTS ambito text,
  ADD COLUMN IF NOT EXISTS direccion text;

ALTER TABLE public.qard_movimientos DROP CONSTRAINT IF EXISTS qard_movimientos_ambito_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_ambito_check
  CHECK (ambito IS NULL OR ambito IN ('eje','sub_qr','cobros'));
ALTER TABLE public.qard_movimientos DROP CONSTRAINT IF EXISTS qard_movimientos_direccion_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_direccion_check
  CHECK (direccion IS NULL OR direccion IN ('entrada','salida'));

ALTER TABLE public.qard_movimientos DROP CONSTRAINT IF EXISTS qard_movimientos_tipo_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_tipo_check CHECK (tipo = ANY (ARRAY[
 'recarga','comision','cobro_comercio','cobro_recibido','devolucion','ajuste',
 'transfer_a_sub','transfer_desde_sub','transferencia_p2p_out','transferencia_p2p_in',
 'retiro_oxxo','retiro_spei','retiro_qard','traspaso_cobros_out','traspaso_cobros_in']));

CREATE OR REPLACE FUNCTION public.tg_qard_mov_ambito()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _idx int;
BEGIN
  IF NEW.sub_qr_id IS NOT NULL THEN
    SELECT sub_index INTO _idx FROM public.qard_sub_qr WHERE id = NEW.sub_qr_id;
  END IF;
  IF NEW.ambito IS NULL THEN
    NEW.ambito := CASE
      WHEN NEW.tipo IN ('cobro_recibido','traspaso_cobros_out') THEN 'cobros'
      WHEN NEW.tipo LIKE 'retiro_%' AND COALESCE(NEW.metadata->>'bolsa','') = 'comercio' THEN 'cobros'
      WHEN NEW.tipo IN ('recarga','comision','transfer_a_sub','transfer_desde_sub','traspaso_cobros_in','ajuste') THEN 'eje'
      WHEN COALESCE(_idx,0) > 0 THEN 'sub_qr'
      ELSE 'eje' END;
  END IF;
  IF NEW.direccion IS NULL THEN
    NEW.direccion := CASE
      WHEN NEW.tipo IN ('recarga','cobro_recibido','traspaso_cobros_in','transferencia_p2p_in','transfer_desde_sub','devolucion') THEN 'entrada'
      WHEN NEW.tipo = 'ajuste' AND NEW.monto_mxn >= 0 THEN 'entrada'
      ELSE 'salida' END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_qard_mov_ambito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_qard_mov_ambito ON public.qard_movimientos;
CREATE TRIGGER trg_qard_mov_ambito BEFORE INSERT ON public.qard_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_qard_mov_ambito();

CREATE OR REPLACE FUNCTION public.qard_pasar_cobros_a_eje(_monto numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _w record;
  _nuevo_com numeric;
  _nuevo_eje numeric;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Inicia sesión para continuar'); END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Escribe un monto válido'); END IF;
  SELECT * INTO _w FROM public.qard_wallets WHERE titular_user_id = _uid FOR UPDATE;
  IF _w IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No tienes billetera'); END IF;
  IF COALESCE(_w.saldo_comercio_mxn, 0) < _monto THEN RETURN jsonb_build_object('ok', false, 'error', 'Saldo de cobros insuficiente'); END IF;

  _nuevo_com := ROUND(COALESCE(_w.saldo_comercio_mxn, 0) - _monto, 2);
  _nuevo_eje := ROUND(COALESCE(_w.saldo_mxn, 0) + _monto, 2);

  UPDATE public.qard_wallets SET saldo_comercio_mxn = _nuevo_com, saldo_mxn = _nuevo_eje WHERE id = _w.id;
  UPDATE public.qard_sub_qr SET saldo_mxn = _nuevo_eje WHERE wallet_id = _w.id AND sub_index = 0;

  INSERT INTO public.qard_movimientos
    (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, comercio_user_id,
     comision_mxn, neto_comercio_mxn, descripcion, metadata, ambito, direccion)
  VALUES
    (_w.id, _uid, 'traspaso_cobros_out', _monto, _nuevo_com, _uid, 0, -_monto,
     'Traspaso a mi cuenta eje', jsonb_build_object('lado','cargo','bolsa','comercio'), 'cobros', 'salida'),
    (_w.id, _uid, 'traspaso_cobros_in', _monto, _nuevo_eje, NULL, 0, 0,
     'Traspaso recibido de cobros', jsonb_build_object('lado','abono','bolsa','eje'), 'eje', 'entrada');

  RETURN jsonb_build_object('ok', true, 'saldo_comercio', _nuevo_com, 'saldo_eje', _nuevo_eje);
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'qard_pasar_cobros_a_eje fallo: % %', SQLSTATE, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'No se pudo completar en este momento; intenta de nuevo');
END;
$function$;