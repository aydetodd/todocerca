CREATE OR REPLACE FUNCTION public.rpc_qard_scan_foraneo(_qard_number text, _viaje_id uuid, _lat double precision, _lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qard text := regexp_replace(COALESCE(_qard_number, ''), '\D', '', 'g');
  v_viaje public.viajes_realizados%ROWTYPE;
  v_prod_id uuid;
  v_geo record;
  v_open public.qard_viajes_pasajero%ROWTYPE;
  v_precio numeric(10,2);
  v_precio_subida numeric(10,2);
  v_precio_bajada numeric(10,2);
  v_wallet_id uuid;
  v_saldo numeric(10,2);
  v_titular uuid;
  v_sub_qr_id uuid;
  v_sub_index int;
  v_saldo_origen numeric(10,2);
  v_saldo_despues numeric(10,2);
  v_min_saldo numeric(10,2);
  v_num_sub int;
  v_num_baj int;
BEGIN
  IF length(v_qard) <> 16 THEN
    RETURN jsonb_build_object('ok',false,'error','QaRd inválida: deben ser 16 dígitos');
  END IF;

  SELECT * INTO v_viaje FROM public.viajes_realizados WHERE id = _viaje_id;
  IF v_viaje.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje no existe'); END IF;
  IF v_viaje.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no esta en curso'); END IF;
  v_prod_id := v_viaje.producto_id;
  IF v_prod_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje sin producto/ruta'); END IF;

  SELECT g.id, g.nombre, g.radio_m, g.precio_mxn,
    2 * 6371000 * asin(sqrt(
      power(sin(radians((g.lat - _lat)/2)), 2) +
      cos(radians(_lat)) * cos(radians(g.lat)) *
      power(sin(radians((g.lng - _lng)/2)), 2)
    )) AS dist_m
  INTO v_geo
  FROM public.unidad_geocercas_cobro g
  WHERE g.producto_id = v_prod_id
  ORDER BY dist_m ASC
  LIMIT 1;

  IF v_geo.id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Esta ruta no tiene geocercas de cobro configuradas');
  END IF;
  IF v_geo.dist_m > v_geo.radio_m THEN
    RETURN jsonb_build_object('ok',false,'error',format('Estas fuera de toda geocerca de cobro (%s m a %s)', round(v_geo.dist_m)::int, v_geo.nombre));
  END IF;

  SELECT * INTO v_open FROM public.qard_viajes_pasajero
    WHERE viaje_id = _viaje_id AND qard_number = v_qard AND estado = 'abierto'
    ORDER BY subida_at DESC LIMIT 1;

  -- Todas las QaRd reales viven en qard_sub_qr: principal = sub_index 0, adicionales = sub_index > 0.
  SELECT s.id, s.wallet_id, s.titular_user_id, s.sub_index, s.saldo_mxn, w.saldo_mxn
    INTO v_sub_qr_id, v_wallet_id, v_titular, v_sub_index, v_saldo, v_saldo_origen
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = v_qard
    AND s.estado = 'activa'
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','QaRd no encontrada o apagada. El pasajero debe revisar su QaRd.');
  END IF;

  IF COALESCE(v_sub_index, 0) = 0 THEN
    v_saldo_origen := v_saldo_origen;
    v_min_saldo := -50;
  ELSE
    v_saldo_origen := v_saldo;
    v_min_saldo := 0;
  END IF;

  IF v_open.id IS NULL THEN
    -- SUBIDA: solo deja en standby, todavía no descuenta.
    IF v_saldo_origen < 5 THEN
      RETURN jsonb_build_object('ok',false,'error','Saldo insuficiente (minimo $5 para subir).');
    END IF;

    SELECT COALESCE(MAX(numero_subida),0) + 1 INTO v_num_sub
      FROM public.qard_viajes_pasajero WHERE viaje_id = _viaje_id;

    INSERT INTO public.qard_viajes_pasajero (
      qard_number, viaje_id, producto_id, unidad_id, chofer_id,
      subida_geocerca_id, subida_lat, subida_lng, numero_subida
    ) VALUES (
      v_qard, _viaje_id, v_prod_id, v_viaje.unidad_id, v_viaje.chofer_id,
      v_geo.id, _lat, _lng, v_num_sub
    );

    UPDATE public.viajes_realizados
      SET pasajeros_subidos = COALESCE(pasajeros_subidos,0) + 1,
          pasajeros_a_bordo = COALESCE(pasajeros_a_bordo,0) + 1
      WHERE id = _viaje_id;

    RETURN jsonb_build_object('ok',true,'tipo','sube','geocerca',v_geo.nombre,'saldo',v_saldo_origen,'numero_subida',v_num_sub);
  ELSE
    -- BAJADA: aquí se calcula y cobra el tramo.
    IF v_open.subida_geocerca_id = v_geo.id
       AND EXTRACT(EPOCH FROM (now() - v_open.subida_at)) < 60 THEN
      RETURN jsonb_build_object('ok',false,'error','Doble scan en la misma parada, espera un momento.');
    END IF;

    SELECT precio_mxn INTO v_precio FROM public.ruta_tarifas_tramo
      WHERE producto_id = v_prod_id
        AND desde_geocerca_id = v_open.subida_geocerca_id
        AND hasta_geocerca_id = v_geo.id
      LIMIT 1;

    IF v_precio IS NULL THEN
      SELECT precio_mxn INTO v_precio_subida FROM public.unidad_geocercas_cobro WHERE id = v_open.subida_geocerca_id;
      v_precio_bajada := v_geo.precio_mxn;
      v_precio := GREATEST(COALESCE(v_precio_subida,0), COALESCE(v_precio_bajada,0));
    END IF;
    IF v_precio IS NULL THEN v_precio := 0; END IF;

    v_saldo_despues := v_saldo_origen - v_precio;
    IF v_precio > 0 AND v_saldo_despues < v_min_saldo THEN
      RETURN jsonb_build_object('ok',false,'error',format('Saldo insuficiente. Saldo: $%s · pasaje: $%s', v_saldo_origen::text, v_precio::text));
    END IF;

    IF v_precio > 0 THEN
      IF COALESCE(v_sub_index, 0) = 0 THEN
        UPDATE public.qard_wallets
          SET saldo_mxn = saldo_mxn - v_precio
          WHERE id = v_wallet_id
          RETURNING saldo_mxn INTO v_saldo_despues;
        UPDATE public.qard_sub_qr
          SET saldo_mxn = saldo_mxn - v_precio
          WHERE id = v_sub_qr_id;
      ELSE
        UPDATE public.qard_sub_qr
          SET saldo_mxn = saldo_mxn - v_precio
          WHERE id = v_sub_qr_id
          RETURNING saldo_mxn INTO v_saldo_despues;
      END IF;

      INSERT INTO public.qard_movimientos (
        wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre
      ) VALUES (
        v_wallet_id, v_titular, CASE WHEN COALESCE(v_sub_index, 0) = 0 THEN NULL ELSE v_sub_qr_id END,
        'cobro_comercio', v_precio, v_saldo_despues,
        format('Cobro tramo %s -> %s', COALESCE((SELECT nombre FROM public.unidad_geocercas_cobro WHERE id = v_open.subida_geocerca_id),'?'), v_geo.nombre),
        'Transporte foraneo'
      );
    END IF;

    SELECT COALESCE(MAX(numero_bajada),0) + 1 INTO v_num_baj
      FROM public.qard_viajes_pasajero WHERE viaje_id = _viaje_id;

    UPDATE public.qard_viajes_pasajero SET
      bajada_geocerca_id = v_geo.id,
      bajada_at = now(),
      bajada_lat = _lat,
      bajada_lng = _lng,
      monto_cobrado_mxn = v_precio,
      estado = 'cerrado',
      numero_bajada = v_num_baj
    WHERE id = v_open.id;

    UPDATE public.viajes_realizados
      SET pasajeros_bajados = COALESCE(pasajeros_bajados,0) + 1,
          pasajeros_a_bordo = GREATEST(COALESCE(pasajeros_a_bordo,0) - 1, 0)
      WHERE id = _viaje_id;

    RETURN jsonb_build_object('ok',true,'tipo','baja','geocerca',v_geo.nombre,'monto',v_precio,'saldo',v_saldo_despues,'numero_bajada',v_num_baj,'numero_subida',v_open.numero_subida);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_qard_scan_foraneo(text, uuid, double precision, double precision) TO authenticated, service_role;