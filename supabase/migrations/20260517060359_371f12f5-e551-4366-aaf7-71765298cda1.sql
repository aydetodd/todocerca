CREATE OR REPLACE FUNCTION public.get_route_live_units(_producto_id uuid)
RETURNS TABLE(
  user_id uuid,
  latitude double precision,
  longitude double precision,
  updated_at timestamp with time zone,
  apodo text,
  estado text,
  provider_type text,
  route_name text,
  route_type text,
  route_producto_id uuid,
  proveedor_id uuid,
  empresa_name text,
  unit_name text,
  unit_placas text,
  unit_descripcion text,
  driver_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_private boolean;
  v_route_type text;
  v_proveedor_id uuid;
  v_allowed boolean := false;
BEGIN
  SELECT COALESCE(p.is_private, false), COALESCE(p.route_type, 'urbana'), p.proveedor_id
    INTO v_is_private, v_route_type, v_proveedor_id
  FROM public.productos p
  WHERE p.id = _producto_id;

  IF _producto_id IS NULL OR v_route_type IS NULL THEN
    RETURN;
  END IF;

  IF v_is_private = false AND v_route_type IN ('urbana', 'foranea') THEN
    RETURN QUERY SELECT * FROM public.get_public_route_live_units(_producto_id);
    RETURN;
  END IF;

  IF NOT (v_is_private = true OR v_route_type = 'privada') THEN
    RETURN;
  END IF;

  v_allowed := auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.route_passenger_access rpa
      WHERE rpa.producto_id = _producto_id
        AND rpa.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.proveedores pr
      WHERE pr.id = v_proveedor_id
        AND pr.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.choferes_empresa ce
      JOIN public.asignaciones_chofer ac ON ac.chofer_id = ce.id
      WHERE ac.producto_id = _producto_id
        AND ce.user_id = auth.uid()
        AND ce.is_active = true
        AND ce.proveedor_id = v_proveedor_id
        AND ce.transport_type = 'privado'
    )
    OR public.is_invited_to_product(_producto_id, auth.uid())
  );

  IF NOT v_allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH latest_private_assignment_per_driver AS (
    SELECT DISTINCT ON (ce.user_id)
      ce.user_id,
      ac.producto_id,
      ac.unidad_id,
      ce.nombre::text AS driver_name
    FROM public.asignaciones_chofer ac
    JOIN public.choferes_empresa ce ON ce.id = ac.chofer_id
    WHERE ce.is_active = true
      AND ce.user_id IS NOT NULL
      AND ce.proveedor_id = v_proveedor_id
      AND ce.transport_type = 'privado'
    ORDER BY ce.user_id, ac.fecha DESC, ac.created_at DESC
  ),
  route_users AS (
    SELECT *
    FROM latest_private_assignment_per_driver lpa
    WHERE lpa.producto_id = _producto_id
  )
  SELECT
    ru.user_id,
    pl.latitude::double precision,
    pl.longitude::double precision,
    pl.updated_at,
    pf.apodo::text,
    pf.estado::text,
    COALESCE(pf.provider_type::text, 'ruta') AS provider_type,
    p.nombre::text AS route_name,
    COALESCE(p.route_type, 'privada')::text AS route_type,
    p.id AS route_producto_id,
    p.proveedor_id,
    pr.nombre::text AS empresa_name,
    ue.nombre::text AS unit_name,
    ue.placas::text AS unit_placas,
    ue.descripcion::text AS unit_descripcion,
    ru.driver_name::text
  FROM route_users ru
  JOIN public.productos p ON p.id = ru.producto_id
  JOIN public.proveedor_locations pl ON pl.user_id = ru.user_id
  JOIN public.profiles pf ON pf.user_id = ru.user_id
  LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_id
  LEFT JOIN public.unidades_empresa ue ON ue.id = ru.unidad_id
  WHERE pf.estado IN ('available', 'busy')
    AND regexp_replace(translate(lower(COALESCE(pf.route_name, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g') =
        regexp_replace(translate(lower(COALESCE(p.nombre, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_route_live_units(uuid) TO anon, authenticated;