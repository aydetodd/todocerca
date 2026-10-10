ALTER FUNCTION public.rpc_qard_scan_foraneo(text, uuid, double precision, double precision) RENAME TO _rpc_qard_scan_tramo;
REVOKE ALL ON FUNCTION public._rpc_qard_scan_tramo(text, uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_qard_scan_foraneo(_qard_number text, _viaje_id uuid, _lat double precision, _lng double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_qard text := regexp_replace(COALESCE(_qard_number,''), '\D', '', 'g');
  v_viaje public.viajes_realizados%ROWTYPE;
  v_tipo text; v_geo record;
  v_wallet_id uuid; v_titular uuid; v_sub_qr_id uuid; v_sub_index int;
  v_saldo_sub numeric; v_saldo_w numeric; v_saldo numeric; v_min numeric; v_precio numeric; v_desp numeric; v_n int;
BEGIN
  SELECT * INTO v_viaje FROM public.viajes_realizados WHERE id = _viaje_id;
  SELECT route_type INTO v_tipo FROM public.productos WHERE id = v_viaje.producto_id;
  IF COALESCE(v_tipo,'') NOT IN ('urbana','publica','taxi_colectivo') THEN
    RETURN public._rpc_qard_scan_tramo(_qard_number, _viaje_id, _lat, _lng);
  END IF;

  IF length(v_qard) <> 16 THEN RETURN jsonb_build_object('ok',false,'error','QaRd inválida: deben ser 16 dígitos'); END IF;
  IF v_viaje.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no esta en curso'); END IF;

  SELECT g.id, g.nombre, g.radio_m, g.precio_mxn,
    2*6371000*asin(sqrt(power(sin(radians((g.lat-_lat)/2)),2)+cos(radians(_lat))*cos(radians(g.lat))*power(sin(radians((g.lng-_lng)/2)),2))) AS dist_m
  INTO v_geo FROM public.unidad_geocercas_cobro g WHERE g.producto_id = v_viaje.producto_id ORDER BY dist_m LIMIT 1;
  IF v_geo.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Esta ruta no tiene geocercas de cobro configuradas'); END IF;
  IF v_geo.dist_m > v_geo.radio_m THEN
    RETURN jsonb_build_object('ok',false,'error',format('Estas fuera de toda geocerca de cobro (%s m a %s)', round(v_geo.dist_m)::int, v_geo.nombre));
  END IF;

  IF EXISTS (SELECT 1 FROM public.qard_viajes_pasajero WHERE viaje_id=_viaje_id AND qard_number=v_qard AND subida_at > now() - interval '60 seconds') THEN
    RETURN jsonb_build_object('ok',false,'error','Esta QaRd ya pagó hace un momento.');
  END IF;

  SELECT s.id, s.wallet_id, s.titular_user_id, s.sub_index, s.saldo_mxn, w.saldo_mxn
    INTO v_sub_qr_id, v_wallet_id, v_titular, v_sub_index, v_saldo_sub, v_saldo_w
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = v_qard AND s.estado = 'activa' LIMIT 1;
  IF v_wallet_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','QaRd no encontrada o apagada. El pasajero debe revisar su QaRd.'); END IF;

  IF COALESCE(v_sub_index,0) = 0 THEN v_saldo := v_saldo_w; v_min := -50; ELSE v_saldo := v_saldo_sub; v_min := 0; END IF;
  v_precio := COALESCE(v_geo.precio_mxn, 0);
  IF v_precio > 0 AND v_saldo - v_precio < v_min THEN
    RETURN jsonb_build_object('ok',false,'error',format('Saldo insuficiente. Saldo: $%s · pasaje: $%s', v_saldo::text, v_precio::text));
  END IF;

  IF v_precio > 0 THEN
    IF COALESCE(v_sub_index,0) = 0 THEN
      UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_wallet_id RETURNING saldo_mxn INTO v_desp;
      UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_sub_qr_id;
    ELSE
      UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_sub_qr_id RETURNING saldo_mxn INTO v_desp;
    END IF;
    INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
    VALUES (v_wallet_id, v_titular, CASE WHEN COALESCE(v_sub_index,0)=0 THEN NULL ELSE v_sub_qr_id END,
      'cobro_comercio', v_precio, v_desp, format('Pasaje %s', v_geo.nombre),
      CASE WHEN v_tipo='taxi_colectivo' THEN 'Taxi colectivo' ELSE 'Transporte urbano' END);
  ELSE v_desp := v_saldo; END IF;

  SELECT COALESCE(MAX(numero_subida),0)+1 INTO v_n FROM public.qard_viajes_pasajero WHERE viaje_id=_viaje_id;
  INSERT INTO public.qard_viajes_pasajero (qard_number, viaje_id, producto_id, unidad_id, chofer_id,
    subida_geocerca_id, subida_lat, subida_lng, numero_subida,
    bajada_geocerca_id, bajada_at, bajada_lat, bajada_lng, monto_cobrado_mxn, estado)
  VALUES (v_qard, _viaje_id, v_viaje.producto_id, v_viaje.unidad_id, v_viaje.chofer_id,
    v_geo.id, _lat, _lng, v_n, v_geo.id, now(), _lat, _lng, v_precio, 'cerrado');

  UPDATE public.viajes_realizados SET pasajeros_subidos = COALESCE(pasajeros_subidos,0)+1 WHERE id=_viaje_id;

  RETURN jsonb_build_object('ok',true,'tipo','pago','geocerca',v_geo.nombre,'monto',v_precio,'saldo',v_desp,'numero_subida',v_n);
END $$;
REVOKE ALL ON FUNCTION public.rpc_qard_scan_foraneo(text, uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_qard_scan_foraneo(text, uuid, double precision, double precision) TO authenticated;