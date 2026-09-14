ALTER TABLE public.qard_sub_qr
  ADD COLUMN IF NOT EXISTS nombre_completo text,
  ADD COLUMN IF NOT EXISTS curp_enc text,
  ADD COLUMN IF NOT EXISTS curp_hash text,
  ADD COLUMN IF NOT EXISTS curp_verificada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificada_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificacion_costo numeric NOT NULL DEFAULT 20;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_qr_curp_titular
  ON public.qard_sub_qr(titular_user_id, curp_hash)
  WHERE curp_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.qard_verificar_sub_qr(
  _sub_qr_id uuid,
  _user_id uuid,
  _nombre text,
  _curp_enc text,
  _curp_hash text
)
RETURNS TABLE(saldo_wallet numeric, costo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sub public.qard_sub_qr;
  _wallet public.qard_wallets;
  _costo numeric;
  _nuevo numeric;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO _sub FROM public.qard_sub_qr WHERE id = _sub_qr_id;
  IF _sub.id IS NULL THEN RAISE EXCEPTION 'Sub-QR no encontrada'; END IF;
  IF _sub.titular_user_id <> _user_id THEN RAISE EXCEPTION 'No es tu sub-QR'; END IF;
  IF _sub.estado = 'cancelada' THEN RAISE EXCEPTION 'Sub-QR cancelada'; END IF;
  IF _sub.curp_verificada THEN RAISE EXCEPTION 'Esta sub-QR ya está verificada'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.qard_sub_qr
    WHERE titular_user_id = _user_id AND curp_hash = _curp_hash AND id <> _sub_qr_id
  ) THEN
    RAISE EXCEPTION 'Esa CURP ya está registrada en otra de tus sub-QR';
  END IF;

  _costo := COALESCE(_sub.verificacion_costo, 20);

  SELECT * INTO _wallet FROM public.qard_wallets WHERE titular_user_id = _user_id FOR UPDATE;
  IF _wallet.id IS NULL THEN RAISE EXCEPTION 'No tienes cuenta QaRd'; END IF;
  IF _wallet.saldo_mxn < _costo THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitas $% en tu QaRd', _costo;
  END IF;

  _nuevo := _wallet.saldo_mxn - _costo;
  UPDATE public.qard_wallets SET saldo_mxn = _nuevo, updated_at = now() WHERE id = _wallet.id;

  UPDATE public.qard_sub_qr SET
    nombre_completo = _nombre,
    curp_enc = _curp_enc,
    curp_hash = _curp_hash,
    curp_verificada = true,
    verificada_at = now(),
    updated_at = now()
  WHERE id = _sub_qr_id;

  INSERT INTO public.qard_movimientos(
    wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, metadata
  ) VALUES (
    _wallet.id, _user_id, _sub_qr_id, 'comision', -_costo, _nuevo,
    'Verificación de sub-QR (' || COALESCE(_sub.alias, '') || ')',
    jsonb_build_object('concepto', 'verificacion_sub_qr', 'sub_index', _sub.sub_index)
  );

  PERFORM public.qard_cobrar_comision(
    _user_id, 'account_opening'::commission_type, _costo, NULL, NULL,
    'Verificación de sub-QR (' || COALESCE(_sub.alias, '') || ')', NULL, _sub.qard_number
  );

  RETURN QUERY SELECT _nuevo, _costo;
END;
$$;

REVOKE ALL ON FUNCTION public.qard_verificar_sub_qr(uuid, uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_verificar_sub_qr(uuid, uuid, text, text, text) TO service_role;