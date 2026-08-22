
CREATE OR REPLACE FUNCTION public.ev_crear_grupo_pase(
  _evento_id uuid,
  _nombre text,
  _telefono text DEFAULT NULL,
  _personas integer DEFAULT 1
)
RETURNS TABLE (grupo_id uuid, pase_id uuid, codigo text, saldo_despues numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wallet public.qard_wallets%ROWTYPE;
  v_costo numeric := 1;
  v_grupo uuid;
  v_pase uuid;
  v_codigo text;
  v_saldo numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ev_eventos e WHERE e.id = _evento_id AND e.owner_id = v_uid) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;
  IF _personas IS NULL OR _personas < 1 THEN _personas := 1; END IF;

  SELECT * INTO v_wallet FROM public.qard_wallets w WHERE w.titular_user_id = v_uid FOR UPDATE;
  IF v_wallet.id IS NULL THEN RAISE EXCEPTION 'Activa tu QaRd para generar pases'; END IF;
  IF v_wallet.saldo_mxn < v_costo THEN RAISE EXCEPTION 'Saldo insuficiente: cada QR cuesta $1'; END IF;

  v_saldo := v_wallet.saldo_mxn - v_costo;
  UPDATE public.qard_wallets SET saldo_mxn = v_saldo, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.ev_grupos (evento_id, nombre, telefono, pases_total)
  VALUES (_evento_id, _nombre, _telefono, _personas) RETURNING id INTO v_grupo;

  INSERT INTO public.ev_pases (evento_id, grupo_id, nombre_invitado, telefono, personas)
  VALUES (_evento_id, v_grupo, _nombre, _telefono, _personas)
  RETURNING id, ev_pases.codigo INTO v_pase, v_codigo;

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, metadata)
  VALUES (v_wallet.id, v_uid, 'pago', -v_costo, v_saldo, 'Pase de evento QR', jsonb_build_object('evento_id', _evento_id, 'pase_id', v_pase));

  RETURN QUERY SELECT v_grupo, v_pase, v_codigo, v_saldo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ev_crear_grupo_pase(uuid, text, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ev_crear_grupo_pase(uuid, text, text, integer) TO authenticated;
