CREATE OR REPLACE FUNCTION public.save_private_route_trace(
  _producto_id uuid,
  _filename text,
  _geojson jsonb
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa. Inicia sesión como concesionario.';
  END IF;

  IF _producto_id IS NULL OR coalesce(trim(_filename), '') = '' THEN
    RAISE EXCEPTION 'Faltan datos del trazado.';
  END IF;

  IF _geojson IS NULL
    OR jsonb_typeof(_geojson) <> 'object'
    OR _geojson->>'type' <> 'FeatureCollection'
    OR jsonb_typeof(_geojson->'features') <> 'array'
    OR jsonb_array_length(_geojson->'features') = 0 THEN
    RAISE EXCEPTION 'Archivo leído, pero no contiene una ruta válida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_geojson->'features') AS feature
    WHERE feature->'geometry'->>'type' IN ('LineString', 'MultiLineString')
  ) THEN
    RAISE EXCEPTION 'El archivo no contiene una línea de ruta.';
  END IF;

  UPDATE public.productos p
  SET route_geojson = _geojson,
      route_trace_filename = _filename,
      route_trace_updated_at = now()
  WHERE p.id = _producto_id
    AND (p.route_type = 'privada' OR p.is_private IS TRUE)
    AND EXISTS (
      SELECT 1
      FROM public.proveedores pr
      WHERE pr.id = p.proveedor_id
        AND pr.user_id = auth.uid()
    )
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se guardó: esta ruta privada no pertenece a tu concesionario.';
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_private_route_trace(_producto_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa. Inicia sesión como concesionario.';
  END IF;

  UPDATE public.productos p
  SET route_geojson = NULL,
      route_trace_filename = NULL,
      route_trace_updated_at = NULL
  WHERE p.id = _producto_id
    AND (p.route_type = 'privada' OR p.is_private IS TRUE)
    AND EXISTS (
      SELECT 1
      FROM public.proveedores pr
      WHERE pr.id = p.proveedor_id
        AND pr.user_id = auth.uid()
    )
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se quitó: esta ruta privada no pertenece a tu concesionario.';
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_private_route_by_token(_token uuid)
RETURNS TABLE(
  id uuid,
  nombre text,
  proveedor_user_id uuid,
  route_type text,
  route_geojson jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre, pr.user_id, p.route_type, p.route_geojson
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.invite_token = _token
    AND (p.route_type = 'privada' OR p.is_private IS TRUE)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.save_private_route_trace(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_private_route_trace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_private_route_by_token(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_private_route_trace(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_private_route_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_route_by_token(uuid) TO anon, authenticated;