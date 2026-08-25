CREATE OR REPLACE FUNCTION public.ev_crear_pases_masivos(_evento_id uuid, _cantidad integer)
RETURNS TABLE(creados integer, costo numeric, saldo_despues numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wallet public.qard_wallets%ROWTYPE;
  v_costo numeric;
  v_grupo uuid;
  v_saldo numeric;
  i integer;
  v_pase uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _cantidad IS NULL OR _cantidad < 1 OR _cantidad > 2000 THEN
    RAISE EXCEPTION 'Cantidad inválida (1 a 2000)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ev_eventos e WHERE e.id = _evento_id AND e.owner_id = v_uid) THEN
    RAISE EXCEPTION 'Evento no encontrado';
  END IF;

  v_costo := _cantidad::numeric;

  SELECT * INTO v_wallet FROM public.qard_wallets w WHERE w.titular_user_id = v_uid FOR UPDATE;
  IF v_wallet.id IS NULL THEN RAISE EXCEPTION 'Activa tu QaRd para generar pases'; END IF;
  IF v_wallet.saldo_mxn < v_costo THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitas $% para % QR', v_costo, _cantidad;
  END IF;

  v_saldo := v_wallet.saldo_mxn - v_costo;
  UPDATE public.qard_wallets SET saldo_mxn = v_saldo, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.ev_grupos (evento_id, nombre, telefono, pases_total)
  VALUES (_evento_id, 'Lote de ' || _cantidad || ' invitaciones', NULL, _cantidad)
  RETURNING id INTO v_grupo;

  FOR i IN 1.._cantidad LOOP
    INSERT INTO public.ev_pases (evento_id, grupo_id, nombre_invitado, telefono, personas)
    VALUES (_evento_id, v_grupo, NULL, NULL, 1)
    RETURNING id INTO v_pase;
  END LOOP;

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, metadata)
  VALUES (v_wallet.id, v_uid, 'pago', -v_costo, v_saldo,
          _cantidad || ' invitaciones QR de evento', jsonb_build_object('evento_id', _evento_id, 'grupo_id', v_grupo, 'cantidad', _cantidad));

  RETURN QUERY SELECT _cantidad, v_costo, v_saldo;
END;
$function$;