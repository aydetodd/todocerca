
CREATE TABLE public.ruta_geocercas_cobro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  nombre text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radio_m integer NOT NULL DEFAULT 150,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ruta_geocercas_cobro TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruta_geocercas_cobro TO authenticated;
GRANT ALL ON public.ruta_geocercas_cobro TO service_role;
ALTER TABLE public.ruta_geocercas_cobro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgc_read_all" ON public.ruta_geocercas_cobro FOR SELECT USING (true);
CREATE POLICY "rgc_owner_all" ON public.ruta_geocercas_cobro FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = producto_id AND pr.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = producto_id AND pr.user_id = auth.uid()
  ));

CREATE TABLE public.ruta_tarifas_tramo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  desde_geocerca_id uuid NOT NULL REFERENCES public.ruta_geocercas_cobro(id) ON DELETE CASCADE,
  hasta_geocerca_id uuid NOT NULL REFERENCES public.ruta_geocercas_cobro(id) ON DELETE CASCADE,
  precio_mxn numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, desde_geocerca_id, hasta_geocerca_id)
);
GRANT SELECT ON public.ruta_tarifas_tramo TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruta_tarifas_tramo TO authenticated;
GRANT ALL ON public.ruta_tarifas_tramo TO service_role;
ALTER TABLE public.ruta_tarifas_tramo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rtt_read_all" ON public.ruta_tarifas_tramo FOR SELECT USING (true);
CREATE POLICY "rtt_owner_all" ON public.ruta_tarifas_tramo FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = producto_id AND pr.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = producto_id AND pr.user_id = auth.uid()
  ));

CREATE TABLE public.qard_viajes_pasajero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qard_number text NOT NULL,
  viaje_id uuid NOT NULL REFERENCES public.viajes_realizados(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  unidad_id uuid,
  chofer_id uuid,
  subida_geocerca_id uuid REFERENCES public.ruta_geocercas_cobro(id) ON DELETE SET NULL,
  subida_at timestamptz NOT NULL DEFAULT now(),
  subida_lat double precision,
  subida_lng double precision,
  bajada_geocerca_id uuid REFERENCES public.ruta_geocercas_cobro(id) ON DELETE SET NULL,
  bajada_at timestamptz,
  bajada_lat double precision,
  bajada_lng double precision,
  monto_cobrado_mxn numeric(10,2),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado','auto_cerrado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qard_viajes_pasajero TO authenticated;
GRANT ALL ON public.qard_viajes_pasajero TO service_role;
ALTER TABLE public.qard_viajes_pasajero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qvp_pasajero_read" ON public.qard_viajes_pasajero FOR SELECT
  USING (
    qard_number IN (
      SELECT p.qard_number FROM public.profiles p WHERE p.user_id = auth.uid() AND p.qard_number IS NOT NULL
      UNION
      SELECT s.qard_number FROM public.qard_sub_qr s WHERE s.titular_user_id = auth.uid()
    )
  );
CREATE POLICY "qvp_conce_read" ON public.qard_viajes_pasajero FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = producto_id AND pr.user_id = auth.uid()
  ));

CREATE INDEX qvp_viaje_open_idx ON public.qard_viajes_pasajero (viaje_id, qard_number, estado);
CREATE INDEX qvp_producto_idx ON public.qard_viajes_pasajero (producto_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ruta_geocercas_cobro;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ruta_tarifas_tramo;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_viajes_pasajero;

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_rgc_touch BEFORE UPDATE ON public.ruta_geocercas_cobro
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_rtt_touch BEFORE UPDATE ON public.ruta_tarifas_tramo
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_qvp_touch BEFORE UPDATE ON public.qard_viajes_pasajero
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

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
  v_wallet_id uuid;
  v_saldo numeric(10,2);
  v_titular uuid;
BEGIN
  SELECT * INTO v_viaje FROM public.viajes_realizados WHERE id = _viaje_id;
  IF v_viaje.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje no existe'); END IF;
  IF v_viaje.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no esta en curso'); END IF;
  v_prod_id := v_viaje.producto_id;
  IF v_prod_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Viaje sin producto/ruta'); END IF;

  SELECT g.id, g.nombre, g.radio_m,
    2 * 6371000 * asin(sqrt(
      power(sin(radians((g.lat - _lat)/2)), 2) +
      cos(radians(_lat)) * cos(radians(g.lat)) *
      power(sin(radians((g.lng - _lng)/2)), 2)
    )) AS dist_m
  INTO v_geo
  FROM public.ruta_geocercas_cobro g
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
      SELECT precio_mxn INTO v_precio FROM public.ruta_tarifas_tramo
        WHERE producto_id = v_prod_id AND desde_geocerca_id = v_geo.id AND hasta_geocerca_id = v_geo.id LIMIT 1;
    END IF;
    IF v_precio IS NULL THEN v_precio := 0; END IF;

    IF v_precio > 0 AND v_wallet_id IS NOT NULL THEN
      UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_wallet_id;
      INSERT INTO public.qard_movimientos (
        wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre
      )
      SELECT v_wallet_id, v_titular, 'cobro_comercio', v_precio, w.saldo_mxn,
             format('Cobro tramo %s -> %s', COALESCE((SELECT nombre FROM public.ruta_geocercas_cobro WHERE id = v_open.subida_geocerca_id),'?'), v_geo.nombre),
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

GRANT EXECUTE ON FUNCTION public.rpc_qard_scan_foraneo(text,uuid,double precision,double precision) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_auto_cerrar_standbys()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_precio numeric(10,2); v_wallet uuid; v_titular uuid;
BEGIN
  IF NEW.estado = 'completado' AND (OLD.estado IS DISTINCT FROM 'completado') THEN
    FOR r IN
      SELECT * FROM public.qard_viajes_pasajero
       WHERE viaje_id = NEW.id AND estado = 'abierto'
    LOOP
      SELECT COALESCE(MAX(precio_mxn),0) INTO v_precio
      FROM public.ruta_tarifas_tramo
      WHERE producto_id = r.producto_id AND desde_geocerca_id = r.subida_geocerca_id;

      v_wallet := NULL; v_titular := NULL;
      SELECT w.id, w.titular_user_id INTO v_wallet, v_titular
        FROM public.qard_wallets w
        JOIN public.profiles pr ON pr.user_id = w.titular_user_id
        WHERE pr.qard_number = r.qard_number LIMIT 1;
      IF v_wallet IS NULL THEN
        SELECT w.id, w.titular_user_id INTO v_wallet, v_titular
          FROM public.qard_sub_qr s
          JOIN public.qard_wallets w ON w.id = s.wallet_id
          WHERE s.qard_number = r.qard_number LIMIT 1;
      END IF;

      IF v_precio > 0 AND v_wallet IS NOT NULL THEN
        UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - v_precio WHERE id = v_wallet;
        INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
        SELECT v_wallet, v_titular, 'cobro_comercio', v_precio, w.saldo_mxn,
               'Cobro automatico al cierre de viaje (tarifa maxima)', 'Transporte foraneo'
        FROM public.qard_wallets w WHERE w.id = v_wallet;
      END IF;

      UPDATE public.qard_viajes_pasajero SET
        monto_cobrado_mxn = v_precio,
        estado = 'auto_cerrado',
        bajada_at = now()
      WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_viaje_auto_cerrar_standbys ON public.viajes_realizados;
CREATE TRIGGER trg_viaje_auto_cerrar_standbys
  AFTER UPDATE ON public.viajes_realizados
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_cerrar_standbys();
