ALTER TABLE public.unidad_geocercas_cobro
  DROP CONSTRAINT IF EXISTS unidad_geocercas_cobro_radio_m_check;

ALTER TABLE public.unidad_geocercas_cobro
  ADD CONSTRAINT unidad_geocercas_cobro_radio_m_check
  CHECK (radio_m BETWEEN 50 AND 99999);

CREATE OR REPLACE FUNCTION public.rpc_unidad_set_geocercas_cobro(
  _unidad_id uuid,
  _sentido text,
  _zonas jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean;
  _count int := 0;
  _zona jsonb;
  _orden int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  IF _sentido NOT IN ('ida','vuelta') THEN
    RAISE EXCEPTION 'Sentido inválido';
  END IF;

  SELECT public.is_proveedor_owner(u.proveedor_id, auth.uid()) INTO _is_owner
  FROM public.unidades_empresa u WHERE u.id = _unidad_id;
  IF NOT COALESCE(_is_owner, false) THEN
    RAISE EXCEPTION 'No autorizado para esta unidad';
  END IF;

  DELETE FROM public.unidad_geocercas_cobro
  WHERE unidad_id = _unidad_id AND sentido = _sentido;

  IF _zonas IS NOT NULL AND jsonb_typeof(_zonas) = 'array' THEN
    FOR _zona IN SELECT * FROM jsonb_array_elements(_zonas) LOOP
      INSERT INTO public.unidad_geocercas_cobro(
        unidad_id, sentido, orden, nombre, lat, lng, radio_m, precio_mxn
      ) VALUES (
        _unidad_id,
        _sentido,
        _orden,
        COALESCE(NULLIF(btrim(_zona->>'nombre'), ''), 'Zona ' || (_orden+1)::text),
        (_zona->>'lat')::numeric,
        (_zona->>'lng')::numeric,
        GREATEST(50, LEAST(99999, COALESCE((_zona->>'radio_m')::int, 200))),
        GREATEST(0, COALESCE((_zona->>'precio_mxn')::numeric, 0))
      );
      _orden := _orden + 1;
      _count := _count + 1;
    END LOOP;
  END IF;

  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_producto_set_geocercas_cobro(
  _producto_id uuid,
  _sentido text,
  _zonas jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_zona jsonb;
  v_orden int := 0;
BEGIN
  IF _sentido NOT IN ('ida','vuelta') THEN
    RAISE EXCEPTION 'sentido invalido: %', _sentido;
  END IF;

  SELECT pr.user_id INTO v_owner
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.id = _producto_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM public.unidad_geocercas_cobro
    WHERE producto_id = _producto_id AND sentido = _sentido;

  FOR v_zona IN SELECT * FROM jsonb_array_elements(COALESCE(_zonas, '[]'::jsonb))
  LOOP
    INSERT INTO public.unidad_geocercas_cobro
      (producto_id, sentido, orden, nombre, lat, lng, radio_m, precio_mxn)
    VALUES (
      _producto_id,
      _sentido,
      v_orden,
      COALESCE(NULLIF(btrim(v_zona->>'nombre'), ''), 'Zona ' || (v_orden+1)::text),
      (v_zona->>'lat')::numeric,
      (v_zona->>'lng')::numeric,
      GREATEST(50, LEAST(99999, COALESCE((v_zona->>'radio_m')::int, 200))),
      GREATEST(0, COALESCE((v_zona->>'precio_mxn')::numeric, 0))
    );
    v_orden := v_orden + 1;
  END LOOP;
END;
$$;

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
      GREATEST(50, LEAST(99999, COALESCE((v_p->>'radio_m')::int, 200)))
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_unidad_set_geocercas_cobro(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_producto_set_geocercas_cobro(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_route_set_paradas(uuid, jsonb) TO authenticated;