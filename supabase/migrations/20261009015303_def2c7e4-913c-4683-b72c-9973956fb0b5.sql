CREATE OR REPLACE FUNCTION public.save_route_endpoints(_producto_id uuid, _origin_lat double precision, _origin_lng double precision, _destination_lat double precision, _destination_lng double precision, _radius_m integer DEFAULT 150)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      route_geofence_radius_m = GREATEST(50, LEAST(99999, COALESCE(_radius_m, 150)))
  WHERE p.id = _producto_id
    AND (
      (p.route_type = 'privada' AND p.is_private IS TRUE)
      OR (p.route_type IN ('foranea', 'urbana', 'taxi_colectivo'))
    )
    AND public.is_proveedor_owner(p.proveedor_id, auth.uid())
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se guardó: esta ruta no pertenece a tu concesionario o no es privada, foránea, urbana o de taxi colectivo.';
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$$;