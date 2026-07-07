CREATE OR REPLACE FUNCTION public.rpc_qard_scan_foraneo(
  _qard_number text,
  _viaje_id uuid,
  _lat double precision,
  _lng double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
BEGIN
  SELECT * INTO v_viaje FROM public.viajes_realizados WHERE id = _viaje_id;
  IF v_viaje.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje no existe'); END IF;
  IF v_viaje.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no esta en curso'); END IF;
  v_prod_id := v_viaje.producto_id;
  IF v_prod_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje sin producto/ruta'); END IF;

  -- Buscar geocerca más cercana en unidad_geocercas_cobro (fuente que usa el diálogo de mapa)
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
    WHERE viaje_id = _viaje_id AND qard_number = _qard_number AND estado = 'abierto'
    ORDER BY subida_at DESC LIMIT 1;

  SELECT w.id, w.saldo_mxn, w.titular_user_id
    INTO v_wallet_id, v_saldo, v_titular
    FROM public.qard_wallets w
    JOIN public.profiles pr ON pr.user_id = w.titular_user_id
    WHERE pr.qard_number = _qard_number
    LIMIT 1;
  IF v_wallet_id IS NULL THEN
    SELECT w.id, w.saldo_mxn, w.titular_user_id
      INTO v_wallet_id, v_saldo, v_titular
      FROM public.qard_sub_qr s
      JOIN public.qard_wallets w ON w.id = s.wallet_id
      WHERE s.qard_number = _qard_number
      LIMIT 1;
  END IF;

  IF v_open.id IS NULL THEN
    -- SUBIDA
    IF v_wallet_id IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','QaRd no encontrada. El pasajero debe registrar su QaRd.');
    END IF;
    IF v_saldo < 5 THEN
      RETURN jsonb_build_object('ok',false,'error','Saldo insuficiente (minimo $5 para subir).');
    END IF;

    INSERT INTO public.qard_viajes_pasajero (
      qard_number, viaje_id, producto_id, unidad_id, chofer_id,
      subida_geocerca_id, subida_lat, subida_lng
    ) VALUES (
      _qard_number, _viaje_id, v_prod_id, v_viaje.unidad_id, v_viaje.chofer_id,
      v_geo.id, _lat, _lng
    );

    UPDATE public.viajes_realizados
      SET pasajeros_subidos = COALESCE(pasajeros_subidos,0) + 1,
          pasajeros_a_bordo = COALESCE(pasajeros_a_bordo,0) + 1
      WHERE id = _viaje_id;

    RETURN jsonb_build_object('ok',true,'tipo','sube','geocerca',v_geo.nombre,'saldo',v_saldo);
  ELSE
    -- BAJADA
    IF v_open.subida_geocerca_id = v_geo.id
       AND EXTRACT(EPOCH FROM (now() - v_open.subida_at)) < 60 THEN
      RETURN jsonb_build_object('ok',false,'error','Doble scan en la misma parada, espera un momento.');
    END IF;

    -- 1) Intentar tarifa por tramo definida en ruta_tarifas_tramo
    SELECT precio_mxn INTO v_precio FROM public.ruta_tarifas_tramo
      WHERE producto_id = v_prod_id
        AND desde_geocerca_id = v_open.subida_geocerca_id
        AND hasta_geocerca_id = v_geo.id
      LIMIT 1;

    -- 2) Fallback: precio_mxn de las geocercas (unidad_geocercas_cobro). Cobrar el mayor entre subida y bajada.
    IF v_precio IS NULL THEN
      SELECT precio_mxn INTO v_precio_subida FROM public.unidad_geocercas_cobro WHERE id = v_open.subida_geocerca_id;
      v_precio_bajada := v_geo.precio_mxn;
      v_precio := GREATEST(COALESCE(v_precio_subida,0), COALESCE(v_precio_bajada,0));
    END IF;
    IF v_precio IS NULL THEN v_precio := 0; END IF;

    IF v_precio > 0 AND v_wallet_id IS NOT NULL THEN
      UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_wallet_id;
      INSERT INTO public.qard_movimientos (
        wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre
      )
      SELECT v_wallet_id, v_titular, 'cobro_comercio', v_precio, w.saldo_mxn,
             format('Cobro tramo %s -> %s', COALESCE((SELECT nombre FROM public.unidad_geocercas_cobro WHERE id = v_open.subida_geocerca_id),'?'), v_geo.nombre),
             'Transporte foraneo'
      FROM public.qard_wallets w WHERE w.id = v_wallet_id;
    END IF;

    UPDATE public.qard_viajes_pasajero SET
      bajada_geocerca_id = v_geo.id,
      bajada_at = now(),
      bajada_lat = _lat,
      bajada_lng = _lng,
      monto_cobrado_mxn = v_precio,
      estado = 'cerrado'
    WHERE id = v_open.id;

    UPDATE public.viajes_realizados
      SET pasajeros_bajados = COALESCE(pasajeros_bajados,0) + 1,
          pasajeros_a_bordo = GREATEST(COALESCE(pasajeros_a_bordo,0) - 1, 0)
      WHERE id = _viaje_id;

    RETURN jsonb_build_object('ok',true,'tipo','baja','geocerca',v_geo.nombre,'monto',v_precio);
  END IF;
END; $$;