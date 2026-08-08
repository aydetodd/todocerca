CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  accion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_hits_select_own" ON public.rate_limit_hits;
CREATE POLICY "rate_limit_hits_select_own"
ON public.rate_limit_hits FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup
  ON public.rate_limit_hits (user_id, accion, created_at DESC);

-- Rate limiting dentro de la transferencia P2P (5 por minuto)
CREATE OR REPLACE FUNCTION public.qard_rate_limit_check(_user_id uuid, _accion text, _max int DEFAULT 5, _ventana_seg int DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.rate_limit_hits
   WHERE user_id = _user_id AND accion = _accion
     AND created_at >= now() - make_interval(secs => _ventana_seg);
  IF v_count >= _max THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_hits (user_id, accion) VALUES (_user_id, _accion);
  RETURN true;
END;
$$;

-- Limpieza automática de registros viejos de rate limit
CREATE OR REPLACE FUNCTION public.qard_rate_limit_purge()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.rate_limit_hits WHERE created_at < now() - interval '1 day';
$$;

CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(_from_numero16 text, _to_numero16 text, _cvv text, _monto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_from_sub_id uuid; v_from_wallet_id uuid; v_from_titular uuid;
  v_from_sub_index int; v_from_sub_saldo numeric; v_from_wallet_saldo numeric;
  v_to_sub_id uuid; v_to_wallet_id uuid; v_to_titular uuid;
  v_to_sub_index int; v_to_cvv_sub text; v_to_cvv_wallet text; v_to_cvv_expected text;
  v_new_cvv text; v_new_cvv_enc text;
  v_from_new_saldo numeric; v_to_new_saldo numeric; v_same_owner boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida'); END IF;

  IF NOT public.qard_rate_limit_check(v_uid, 'qard_transfer_p2p', 5, 60) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera 60 segundos antes de volver a intentarlo.');
  END IF;

  IF _monto IS NULL OR _monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF _from_numero16 IS NULL OR _to_numero16 IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan datos');
  END IF;
  IF _from_numero16 = _to_numero16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Origen y destino son la misma cuenta');
  END IF;

  SELECT s.id, s.wallet_id, s.sub_index, s.saldo_mxn, w.titular_user_id, w.saldo_mxn
    INTO v_from_sub_id, v_from_wallet_id, v_from_sub_index, v_from_sub_saldo, v_from_titular, v_from_wallet_saldo
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _from_numero16 AND w.titular_user_id = v_uid LIMIT 1;

  IF v_from_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta origen no te pertenece');
  END IF;

  IF v_from_sub_index = 0 THEN
    IF v_from_wallet_saldo < _monto THEN RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente'); END IF;
  ELSE
    IF v_from_sub_saldo < _monto THEN RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en sub-QR'); END IF;
  END IF;

  SELECT s.id, s.wallet_id, s.sub_index, s.cvv_dinamico, w.titular_user_id, w.cvv_dinamico
    INTO v_to_sub_id, v_to_wallet_id, v_to_sub_index, v_to_cvv_sub, v_to_titular, v_to_cvv_wallet
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _to_numero16 LIMIT 1;

  IF v_to_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;

  v_same_owner := (v_to_titular = v_uid);

  IF NOT v_same_owner THEN
    v_to_cvv_expected := public.qard_dec(
      CASE WHEN v_to_sub_index = 0 THEN COALESCE(v_to_cvv_wallet, v_to_cvv_sub) ELSE v_to_cvv_sub END);
    IF _cvv IS NULL OR length(regexp_replace(_cvv, '\D', '', 'g')) <> 4 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico requerido (4 dígitos)');
    END IF;
    IF v_to_cvv_expected IS NULL OR v_to_cvv_expected <> regexp_replace(_cvv, '\D', '', 'g') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico incorrecto');
    END IF;
  END IF;

  v_new_cvv := public.gen_cvv4();
  v_new_cvv_enc := public.qard_enc(v_new_cvv);

  IF v_from_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
  END IF;

  IF v_to_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_wallet_id RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_sub_id;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_sub_id RETURNING saldo_mxn INTO v_to_new_saldo;
  END IF;

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_from_wallet_id, v_from_titular, CASE WHEN v_from_sub_index = 0 THEN NULL ELSE v_from_sub_id END,
          'transferencia_p2p_out', _monto, COALESCE(v_from_new_saldo, 0),
          'Transferencia enviada a •••• ' || right(_to_numero16, 4), 'Transferencia P2P');

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_to_wallet_id, v_to_titular, CASE WHEN v_to_sub_index = 0 THEN NULL ELSE v_to_sub_id END,
          'transferencia_p2p_in', _monto, COALESCE(v_to_new_saldo, 0),
          'Transferencia recibida de •••• ' || right(_from_numero16, 4), 'Transferencia P2P');

  RETURN jsonb_build_object('ok', true, 'nuevo_cvv_destino', v_new_cvv);
END;
$function$;