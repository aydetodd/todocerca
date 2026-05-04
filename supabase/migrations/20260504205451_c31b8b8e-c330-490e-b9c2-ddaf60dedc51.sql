
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS route_origin_lat numeric,
  ADD COLUMN IF NOT EXISTS route_origin_lng numeric,
  ADD COLUMN IF NOT EXISTS route_destination_lat numeric,
  ADD COLUMN IF NOT EXISTS route_destination_lng numeric,
  ADD COLUMN IF NOT EXISTS route_geofence_radius_m integer DEFAULT 150;

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
      route_geofence_radius_m = COALESCE(_radius_m, 150)
  WHERE p.id = _producto_id
    AND (p.route_type = 'privada' OR p.is_private IS TRUE)
    AND EXISTS (
      SELECT 1 FROM public.proveedores pr
      WHERE pr.id = p.proveedor_id AND pr.user_id = auth.uid()
    )
  RETURNING p.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'No se guardó: esta ruta privada no pertenece a tu concesionario.';
  END IF;

  RETURN QUERY SELECT _updated_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_route_endpoints(uuid,numeric,numeric,numeric,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_route_endpoints(uuid,numeric,numeric,numeric,numeric,integer) TO authenticated;
