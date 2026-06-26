
-- =========================================================
-- 1) Paradas ordenadas por ruta (producto)
-- =========================================================
CREATE TABLE public.route_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  orden int NOT NULL,
  nombre text NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  radio_m int NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, orden)
);

GRANT SELECT ON public.route_paradas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_paradas TO authenticated;
GRANT ALL ON public.route_paradas TO service_role;

ALTER TABLE public.route_paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Paradas visibles para todos"
  ON public.route_paradas FOR SELECT
  USING (true);

CREATE POLICY "Dueno gestiona paradas"
  ON public.route_paradas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = route_paradas.producto_id AND pr.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = route_paradas.producto_id AND pr.user_id = auth.uid()
  ));

CREATE TRIGGER trg_route_paradas_updated
  BEFORE UPDATE ON public.route_paradas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) Tarifas por tramo (matriz)
-- =========================================================
CREATE TABLE public.route_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  sentido text NOT NULL CHECK (sentido IN ('ida','vuelta')),
  parada_subida_id uuid NOT NULL REFERENCES public.route_paradas(id) ON DELETE CASCADE,
  parada_bajada_id uuid NOT NULL REFERENCES public.route_paradas(id) ON DELETE CASCADE,
  precio_mxn numeric NOT NULL DEFAULT 0 CHECK (precio_mxn >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, sentido, parada_subida_id, parada_bajada_id)
);

GRANT SELECT ON public.route_tarifas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_tarifas TO authenticated;
GRANT ALL ON public.route_tarifas TO service_role;

ALTER TABLE public.route_tarifas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tarifas visibles para todos"
  ON public.route_tarifas FOR SELECT
  USING (true);

CREATE POLICY "Dueno gestiona tarifas"
  ON public.route_tarifas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = route_tarifas.producto_id AND pr.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = route_tarifas.producto_id AND pr.user_id = auth.uid()
  ));

CREATE TRIGGER trg_route_tarifas_updated
  BEFORE UPDATE ON public.route_tarifas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) Cobros QR por tramo
-- =========================================================
CREATE TABLE public.cobros_qr_tramo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id uuid REFERENCES public.viajes_realizados(id) ON DELETE SET NULL,
  unidad_id uuid NOT NULL REFERENCES public.unidades_empresa(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  qr_token text NOT NULL,
  pasajero_user_id uuid,
  sentido text CHECK (sentido IN ('ida','vuelta')),
  parada_subida_id uuid REFERENCES public.route_paradas(id),
  parada_bajada_id uuid REFERENCES public.route_paradas(id),
  subida_lat numeric, subida_lng numeric, subida_at timestamptz,
  bajada_lat numeric, bajada_lng numeric, bajada_at timestamptz,
  precio_apartado numeric NOT NULL DEFAULT 0,
  precio_real numeric,
  devuelto numeric,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado','forzado')),
  fuente text NOT NULL DEFAULT 'telefono' CHECK (fuente IN ('telefono','raspberry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cobros_qr_tramo_open ON public.cobros_qr_tramo (unidad_id, qr_token) WHERE estado = 'abierto';
CREATE INDEX idx_cobros_qr_tramo_viaje ON public.cobros_qr_tramo (viaje_id);

GRANT SELECT, INSERT, UPDATE ON public.cobros_qr_tramo TO authenticated;
GRANT ALL ON public.cobros_qr_tramo TO service_role;

ALTER TABLE public.cobros_qr_tramo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dueno ve sus cobros"
  ON public.cobros_qr_tramo FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.unidades_empresa u
    JOIN public.proveedores pr ON pr.id = u.proveedor_id
    WHERE u.id = cobros_qr_tramo.unidad_id AND pr.user_id = auth.uid()
  ));

CREATE POLICY "Pasajero ve sus cobros"
  ON public.cobros_qr_tramo FOR SELECT
  USING (pasajero_user_id = auth.uid());

CREATE TRIGGER trg_cobros_qr_tramo_updated
  BEFORE UPDATE ON public.cobros_qr_tramo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4) RPC: Guardar paradas (reemplaza todas)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_route_set_paradas(_producto_id uuid, _paradas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_p jsonb;
  v_count int := 0;
BEGIN
  SELECT pr.user_id INTO v_owner
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.id = _producto_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM public.route_paradas WHERE producto_id = _producto_id;

  FOR v_p IN SELECT * FROM jsonb_array_elements(COALESCE(_paradas, '[]'::jsonb))
  LOOP
    INSERT INTO public.route_paradas(producto_id, orden, nombre, lat, lng, radio_m)
    VALUES (
      _producto_id,
      COALESCE((v_p->>'orden')::int, v_count),
      COALESCE(NULLIF(btrim(v_p->>'nombre'),''), 'Parada ' || (v_count+1)::text),
      (v_p->>'lat')::numeric,
      (v_p->>'lng')::numeric,
      GREATEST(50, LEAST(2000, COALESCE((v_p->>'radio_m')::int, 200)))
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =========================================================
-- 5) RPC: Guardar tarifas (reemplaza todas)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_route_set_tarifas(_producto_id uuid, _tarifas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_t jsonb;
  v_count int := 0;
BEGIN
  SELECT pr.user_id INTO v_owner
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.id = _producto_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM public.route_tarifas WHERE producto_id = _producto_id;

  FOR v_t IN SELECT * FROM jsonb_array_elements(COALESCE(_tarifas, '[]'::jsonb))
  LOOP
    INSERT INTO public.route_tarifas(producto_id, sentido, parada_subida_id, parada_bajada_id, precio_mxn)
    VALUES (
      _producto_id,
      v_t->>'sentido',
      (v_t->>'parada_subida_id')::uuid,
      (v_t->>'parada_bajada_id')::uuid,
      GREATEST(0, COALESCE((v_t->>'precio_mxn')::numeric, 0))
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =========================================================
-- 6) Helper: parada más cercana dentro del radio
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_parada_mas_cercana(_producto_id uuid, _lat numeric, _lng numeric)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT id FROM public.route_paradas
  WHERE producto_id = _producto_id
    AND (
      6371000 * 2 * asin(sqrt(
        power(sin(radians((lat - _lat)/2)),2) +
        cos(radians(_lat)) * cos(radians(lat)) *
        power(sin(radians((lng - _lng)/2)),2)
      ))
    ) <= radio_m
  ORDER BY (
    power(lat - _lat, 2) + power(lng - _lng, 2)
  ) ASC
  LIMIT 1;
$$;

-- =========================================================
-- 7) RPC: Escaneo de QR (sube o baja)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_cobro_qr_scan(
  _unidad_id uuid,
  _qr_token text,
  _lat numeric,
  _lng numeric,
  _fuente text DEFAULT 'telefono'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viaje record;
  v_producto_id uuid;
  v_sentido text;
  v_parada uuid;
  v_existing record;
  v_max_precio numeric;
  v_precio_real numeric;
  v_devuelto numeric;
BEGIN
  IF _fuente NOT IN ('telefono','raspberry') THEN _fuente := 'telefono'; END IF;

  -- 1) Viaje en curso de esta unidad
  SELECT id, producto_id INTO v_viaje
  FROM public.viajes_realizados
  WHERE unidad_id = _unidad_id AND estado = 'en_curso'
  ORDER BY inicio_at DESC NULLS LAST
  LIMIT 1;

  IF v_viaje.id IS NULL THEN
    RAISE EXCEPTION 'No hay viaje en curso para esta unidad';
  END IF;

  v_producto_id := v_viaje.producto_id;

  -- 2) Sentido: si la última parada conocida es B → vuelta. Default ida.
  -- Heurística simple: si el viaje tiene origen_lat/destino_lat, ver a cuál está más cerca el camión.
  v_sentido := 'ida';
  -- (placeholder simple; se puede refinar luego)

  -- 3) Parada actual por geocerca
  v_parada := public.fn_parada_mas_cercana(v_producto_id, _lat, _lng);
  IF v_parada IS NULL THEN
    RAISE EXCEPTION 'El camion no esta dentro de una parada conocida';
  END IF;

  -- 4) ¿Hay cobro abierto para este QR en esta unidad?
  SELECT * INTO v_existing
  FROM public.cobros_qr_tramo
  WHERE unidad_id = _unidad_id AND qr_token = _qr_token AND estado = 'abierto'
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    -- SUBIDA: aparta el precio máximo desde esta parada hasta cualquier destino siguiente
    SELECT COALESCE(MAX(precio_mxn), 0) INTO v_max_precio
    FROM public.route_tarifas
    WHERE producto_id = v_producto_id
      AND sentido = v_sentido
      AND parada_subida_id = v_parada;

    INSERT INTO public.cobros_qr_tramo(
      viaje_id, unidad_id, producto_id, qr_token, sentido,
      parada_subida_id, subida_lat, subida_lng, subida_at,
      precio_apartado, fuente
    ) VALUES (
      v_viaje.id, _unidad_id, v_producto_id, _qr_token, v_sentido,
      v_parada, _lat, _lng, now(),
      v_max_precio, _fuente
    );

    RETURN jsonb_build_object(
      'accion','subida',
      'parada_id', v_parada,
      'precio_apartado', v_max_precio,
      'sentido', v_sentido
    );
  ELSE
    -- BAJADA: calcular precio real y devolver diferencia
    SELECT precio_mxn INTO v_precio_real
    FROM public.route_tarifas
    WHERE producto_id = v_producto_id
      AND sentido = v_existing.sentido
      AND parada_subida_id = v_existing.parada_subida_id
      AND parada_bajada_id = v_parada;

    v_precio_real := COALESCE(v_precio_real, v_existing.precio_apartado);
    v_devuelto := GREATEST(0, v_existing.precio_apartado - v_precio_real);

    UPDATE public.cobros_qr_tramo
    SET parada_bajada_id = v_parada,
        bajada_lat = _lat, bajada_lng = _lng, bajada_at = now(),
        precio_real = v_precio_real,
        devuelto = v_devuelto,
        estado = 'cerrado'
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'accion','bajada',
      'parada_id', v_parada,
      'precio_real', v_precio_real,
      'devuelto', v_devuelto,
      'sentido', v_existing.sentido
    );
  END IF;
END;
$$;
