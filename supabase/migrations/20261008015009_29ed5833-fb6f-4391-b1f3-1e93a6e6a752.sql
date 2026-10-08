ALTER TABLE public.rutas_foraneas_maestras ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'foranea';
ALTER TABLE public.rutas_foraneas_maestras DROP CONSTRAINT IF EXISTS rutas_foraneas_maestras_nombre_uniq;
DROP INDEX IF EXISTS public.rutas_foraneas_maestras_nombre_uniq;
CREATE UNIQUE INDEX rutas_foraneas_maestras_nombre_uniq ON public.rutas_foraneas_maestras (tipo, nombre_normalizado);

CREATE OR REPLACE FUNCTION public.save_private_route_trace(_producto_id uuid, _filename text, _geojson jsonb)
 RETURNS TABLE(id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _updated_id uuid; _p record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No hay sesión activa. Inicia sesión como concesionario.'; END IF;
  IF _producto_id IS NULL OR coalesce(trim(_filename), '') = '' THEN RAISE EXCEPTION 'Faltan datos del trazado.'; END IF;
  IF _geojson IS NULL OR jsonb_typeof(_geojson) <> 'object' OR _geojson->>'type' <> 'FeatureCollection'
    OR jsonb_typeof(_geojson->'features') <> 'array' OR jsonb_array_length(_geojson->'features') = 0 THEN
    RAISE EXCEPTION 'Archivo leído, pero no contiene una ruta válida.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_geojson->'features') AS f
    WHERE f->'geometry'->>'type' IN ('LineString','MultiLineString')) THEN
    RAISE EXCEPTION 'El archivo no contiene una línea de ruta.';
  END IF;

  UPDATE public.productos p
  SET route_geojson = _geojson, route_trace_filename = _filename, route_trace_updated_at = now()
  WHERE p.id = _producto_id
    AND (p.route_type IN ('privada','foranea','urbana','taxi_colectivo') OR p.is_private IS TRUE)
    AND EXISTS (SELECT 1 FROM public.proveedores pr WHERE pr.id = p.proveedor_id AND pr.user_id = auth.uid())
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se guardó: esta ruta no pertenece a tu concesionario.';
  END IF;

  -- Alta automática en Rutas Maestras la primera vez (foránea, urbana, taxi colectivo)
  SELECT * INTO _p FROM public.productos WHERE productos.id = _updated_id;
  IF _p.route_type IN ('foranea','urbana','taxi_colectivo') AND coalesce(_p.is_private,false) = false
     AND NOT EXISTS (SELECT 1 FROM public.rutas_foraneas_maestras m
       WHERE m.tipo = _p.route_type AND m.nombre_normalizado = public.normalize_route_name(_p.nombre)) THEN
    INSERT INTO public.rutas_foraneas_maestras (nombre, nombre_normalizado, route_geojson, route_origin_lat, route_origin_lng,
      route_destination_lat, route_destination_lng, route_geofence_radius_m, estado, created_by_user_id, created_by_proveedor_id, tipo)
    VALUES (_p.nombre, public.normalize_route_name(_p.nombre), _geojson, _p.route_origin_lat, _p.route_origin_lng,
      _p.route_destination_lat, _p.route_destination_lng, coalesce(_p.route_geofence_radius_m,150), 'pending', auth.uid(), _p.proveedor_id, _p.route_type);
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$function$;

-- Registrar las rutas urbanas y de taxi colectivo que ya existen
INSERT INTO public.rutas_foraneas_maestras (nombre, nombre_normalizado, route_geojson, route_origin_lat, route_origin_lng,
  route_destination_lat, route_destination_lng, route_geofence_radius_m, estado, created_by_user_id, created_by_proveedor_id, tipo, approved_at)
SELECT DISTINCT ON (p.route_type, public.normalize_route_name(p.nombre))
  p.nombre, public.normalize_route_name(p.nombre), p.route_geojson, p.route_origin_lat, p.route_origin_lng,
  p.route_destination_lat, p.route_destination_lng, coalesce(p.route_geofence_radius_m,150), 'approved', pr.user_id, p.proveedor_id, p.route_type, now()
FROM public.productos p JOIN public.proveedores pr ON pr.id = p.proveedor_id
WHERE p.route_type IN ('urbana','taxi_colectivo') AND coalesce(p.is_private,false)=false
  AND p.route_geojson IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.rutas_foraneas_maestras m
    WHERE m.tipo = p.route_type AND m.nombre_normalizado = public.normalize_route_name(p.nombre));