-- 1) Ampliar CHECK de tipo para incluir 'ruta'
ALTER TABLE public.favoritos DROP CONSTRAINT IF EXISTS favoritos_tipo_check;
ALTER TABLE public.favoritos
  ADD CONSTRAINT favoritos_tipo_check
  CHECK (tipo = ANY (ARRAY['producto'::text, 'proveedor'::text, 'listing'::text, 'ruta'::text]));

-- 2) Modificar get_private_route_by_token para auto-crear favorito al vincular pasajero
CREATE OR REPLACE FUNCTION public.get_private_route_by_token(_token uuid)
 RETURNS TABLE(id uuid, nombre text, proveedor_user_id uuid, route_type text, route_geojson jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _producto_id uuid;
  _proveedor_user uuid;
  _nombre text;
  _route_type text;
  _route_geojson jsonb;
  _is_owner boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión en todocerca.mx para ver esta ruta.';
  END IF;

  SELECT p.id, p.nombre, pr.user_id, p.route_type, p.route_geojson
    INTO _producto_id, _nombre, _proveedor_user, _route_type, _route_geojson
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.invite_token = _token
    AND (p.route_type = 'privada' OR p.is_private IS TRUE)
  LIMIT 1;

  IF _producto_id IS NULL THEN
    RAISE EXCEPTION 'Enlace inválido o expirado.';
  END IF;

  -- Concesionario dueño siempre puede ver
  IF _proveedor_user = auth.uid() THEN
    _is_owner := true;
  END IF;

  IF NOT _is_owner THEN
    -- Vincular al primer usuario que abre el link (idempotente para mismo user)
    INSERT INTO public.route_passenger_access (producto_id, user_id)
    VALUES (_producto_id, auth.uid())
    ON CONFLICT (producto_id, user_id) DO NOTHING;

    -- Verificar que el usuario actual realmente esté vinculado
    IF NOT EXISTS (
      SELECT 1 FROM public.route_passenger_access
      WHERE producto_id = _producto_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Este enlace ya fue reclamado por otra cuenta.';
    END IF;
  END IF;

  -- Auto-agregar como favorito (idempotente). Aplica tanto a dueño como a pasajero.
  INSERT INTO public.favoritos (user_id, tipo, producto_id)
  VALUES (auth.uid(), 'ruta', _producto_id)
  ON CONFLICT (user_id, producto_id) DO NOTHING;

  RETURN QUERY SELECT _producto_id, _nombre, _proveedor_user, _route_type, _route_geojson;
END;
$function$;