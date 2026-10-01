ALTER TABLE public.qard_viajes_pasajero ADD COLUMN IF NOT EXISTS pagado_mxn numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.cobros_qr_tramo ADD COLUMN IF NOT EXISTS pagado_mxn numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.qard_viajes_pasajero DROP CONSTRAINT qard_viajes_pasajero_estado_check;
ALTER TABLE public.qard_viajes_pasajero ADD CONSTRAINT qard_viajes_pasajero_estado_check CHECK (estado = ANY (ARRAY['abierto','cerrado','auto_cerrado','auto_cerrado_sin_saldo']));

CREATE OR REPLACE FUNCTION public.qard_cobrar_stand(_pasajero_id uuid, _etiqueta text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.qard_viajes_pasajero%ROWTYPE; v_precio numeric(10,2); v_ruta text;
  v_sub uuid; v_wallet uuid; v_titular uuid; v_idx int; v_saldo numeric(10,2); v_min numeric(10,2); v_desp numeric(10,2);
BEGIN
  SELECT * INTO r FROM public.qard_viajes_pasajero WHERE id = _pasajero_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT nombre INTO v_ruta FROM public.productos WHERE id = r.producto_id;
  SELECT MAX(precio_mxn) INTO v_precio FROM public.ruta_tarifas_tramo
    WHERE producto_id = r.producto_id AND desde_geocerca_id = r.subida_geocerca_id;
  IF v_precio IS NULL THEN SELECT precio_mxn INTO v_precio FROM public.unidad_geocercas_cobro WHERE id = r.subida_geocerca_id; END IF;
  v_precio := COALESCE(v_precio,0);

  SELECT s.id, s.wallet_id, s.titular_user_id, s.sub_index,
         CASE WHEN COALESCE(s.sub_index,0)=0 THEN w.saldo_mxn ELSE s.saldo_mxn END
    INTO v_sub, v_wallet, v_titular, v_idx, v_saldo
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = r.qard_number LIMIT 1;
  v_min := CASE WHEN COALESCE(v_idx,0)=0 THEN -50 ELSE 0 END;

  IF v_precio <= 0 OR v_wallet IS NULL OR v_saldo - v_precio < v_min THEN
    UPDATE public.qard_viajes_pasajero SET estado = CASE WHEN v_precio > 0 THEN 'auto_cerrado_sin_saldo' ELSE 'auto_cerrado' END,
      monto_cobrado_mxn = 0, bajada_at = COALESCE(bajada_at, now()) WHERE id = r.id;
    RETURN jsonb_build_object('ok',true,'cobrado',0,'sin_saldo', v_precio > 0);
  END IF;

  IF COALESCE(v_idx,0)=0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_wallet RETURNING saldo_mxn INTO v_desp;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_sub;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_sub RETURNING saldo_mxn INTO v_desp;
  END IF;
  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_wallet, v_titular, CASE WHEN COALESCE(v_idx,0)=0 THEN NULL ELSE v_sub END, 'cobro_comercio', v_precio, v_desp,
    COALESCE(_etiqueta, 'Cobro automático por bajada sin QR · ' || COALESCE(v_ruta,'ruta')),
    'Cobro automático por bajada sin QR · ' || COALESCE(v_ruta,'ruta'));
  UPDATE public.qard_viajes_pasajero SET estado='auto_cerrado', monto_cobrado_mxn=v_precio, bajada_at=COALESCE(bajada_at, now()) WHERE id = r.id;
  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES ('00000000-0000-0000-0000-000000000001', v_titular,
    format('Se aplicó cobro automático de $%s porque no mostraste tu QR al bajar en %s. Si crees que es un error, dispútalo dentro de 48 horas.', to_char(v_precio,'FM999990.00'), COALESCE(v_ruta,'la ruta')), false);
  RETURN jsonb_build_object('ok',true,'cobrado',v_precio);
END $$;
REVOKE ALL ON FUNCTION public.qard_cobrar_stand(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_cobrar_stand(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_auto_cerrar_standbys()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.estado = 'completado' AND (OLD.estado IS DISTINCT FROM 'completado') THEN
    FOR r IN SELECT id FROM public.qard_viajes_pasajero WHERE viaje_id = NEW.id AND estado = 'abierto' LOOP
      PERFORM public.qard_cobrar_stand(r.id, NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;