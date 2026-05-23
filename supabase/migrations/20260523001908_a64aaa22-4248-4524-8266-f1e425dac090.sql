-- 1) Permitir guardar endpoints A/B en rutas foráneas
CREATE OR REPLACE FUNCTION public.save_route_endpoints(
  _producto_id uuid,
  _origin_lat numeric,
  _origin_lng numeric,
  _destination_lat numeric,
  _destination_lng numeric,
  _radius_m integer
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;

  UPDATE public.productos p
  SET route_origin_lat = _origin_lat,
      route_origin_lng = _origin_lng,
      route_destination_lat = _destination_lat,
      route_destination_lng = _destination_lng,
      route_geofence_radius_m = GREATEST(50, LEAST(1000, COALESCE(_radius_m, 150)))
  WHERE p.id = _producto_id
    AND (
      (p.route_type = 'privada' AND p.is_private IS TRUE)
      OR (p.route_type = 'foranea')
    )
    AND public.is_proveedor_owner(p.proveedor_id, auth.uid())
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se guardó: esta ruta no pertenece a tu concesionario o no es privada/foránea.';
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$function$;

-- 2) Columna para marcar viajes cerrados por proceso de medianoche
ALTER TABLE public.viajes_realizados
  ADD COLUMN IF NOT EXISTS closed_overnight boolean NOT NULL DEFAULT false;