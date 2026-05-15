CREATE OR REPLACE FUNCTION public.get_public_route_live_units(_producto_id uuid)
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT
      p.id,
      p.nombre,
      p.proveedor_id,
      COALESCE(p.route_type, 'urbana') AS route_type,
      p.estado,
      p.ciudad,
      regexp_replace(lower(COALESCE(p.nombre, '')), '[^a-z0-9]+', '', 'g') AS normalized_name
    FROM public.productos p
    WHERE p.id = _producto_id
      AND COALESCE(p.is_private, false) = false
      AND COALESCE(p.route_type, 'urbana') IN ('urbana', 'foranea')
  ), matching_products AS (
    SELECT p.id, p.nombre, p.proveedor_id, COALESCE(p.route_type, 'urbana') AS route_type
    FROM public.productos p
    JOIN target t ON regexp_replace(lower(COALESCE(p.nombre, '')), '[^a-z0-9]+', '', 'g') = t.normalized_name
      AND COALESCE(p.route_type, 'urbana') = t.route_type
      AND COALESCE(p.is_private, false) = false
      AND COALESCE(p.estado, '') IS NOT DISTINCT FROM COALESCE(t.estado, '')
      AND COALESCE(p.ciudad, '') IS NOT DISTINCT FROM COALESCE(t.ciudad, '')
  ), latest_route_assignments AS (
    SELECT DISTINCT ON (ce.user_id)
      ce.user_id,
      mp.id AS producto_id,
      ac.unidad_id,
      ce.nombre AS driver_name,
      1 AS source_priority
    FROM public.asignaciones_chofer ac
    JOIN public.choferes_empresa ce ON ce.id = ac.chofer_id
    JOIN matching_products mp ON mp.id = ac.producto_id
    WHERE ce.is_active = true
      AND ce.user_id IS NOT NULL
      AND COALESCE(ce.transport_type, 'publico') <> 'taxi'
    ORDER BY
      ce.user_id,
      CASE WHEN ac.fecha = ((now() AT TIME ZONE 'America/Hermosillo')::date) THEN 0 ELSE 1 END,
      ac.fecha DESC,
      ac.created_at DESC
  ), provider_profile_match AS (
    SELECT
      pr.user_id,
      mp.id AS producto_id,
      NULL::uuid AS unidad_id,
      NULL::text AS driver_name,
      2 AS source_priority
    FROM matching_products mp
    JOIN public.proveedores pr ON pr.id = mp.proveedor_id
    JOIN public.profiles pf ON pf.user_id = pr.user_id
    WHERE regexp_replace(lower(COALESCE(pf.route_name, '')), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(COALESCE(mp.nombre, '')), '[^a-z0-9]+', '', 'g')
  ), route_user_candidates AS (
    SELECT * FROM latest_route_assignments
    UNION ALL
    SELECT * FROM provider_profile_match
  ), route_users AS (
    SELECT DISTINCT ON (user_id)
      user_id,
      producto_id,
      unidad_id,
      driver_name
    FROM route_user_candidates
    ORDER BY user_id, source_priority
  )
  SELECT
    ru.user_id,
    pl.latitude::double precision,
    pl.longitude::double precision,
    pl.updated_at,
    pf.apodo,
    pf.estado::text,
    COALESCE(pf.provider_type::text, 'ruta') AS provider_type,
    mp.nombre AS route_name,
    mp.route_type,
    mp.id AS route_producto_id,
    mp.proveedor_id,
    pr.nombre AS empresa_name,
    ue.nombre AS unit_name,
    ue.placas AS unit_placas,
    ue.descripcion AS unit_descripcion,
    ru.driver_name
  FROM route_users ru
  JOIN matching_products mp ON mp.id = ru.producto_id
  JOIN public.proveedor_locations pl ON pl.user_id = ru.user_id
  JOIN public.profiles pf ON pf.user_id = ru.user_id
  LEFT JOIN public.proveedores pr ON pr.id = mp.proveedor_id
  LEFT JOIN public.unidades_empresa ue ON ue.id = ru.unidad_id
  WHERE pf.estado IN ('available', 'busy');
$$;

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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    )
    OR public.is_invited_to_product(_producto_id, auth.uid())
  );

  IF NOT v_allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH latest_route_assignments AS (
    SELECT DISTINCT ON (ce.user_id)
      ce.user_id,
      ac.producto_id,
      ac.unidad_id,
      ce.nombre AS driver_name
    FROM public.asignaciones_chofer ac
    JOIN public.choferes_empresa ce ON ce.id = ac.chofer_id
    WHERE ac.producto_id = _producto_id
      AND ce.is_active = true
      AND ce.user_id IS NOT NULL
      AND COALESCE(ce.transport_type, 'privado') <> 'taxi'
    ORDER BY
      ce.user_id,
      CASE WHEN ac.fecha = ((now() AT TIME ZONE 'America/Hermosillo')::date) THEN 0 ELSE 1 END,
      ac.fecha DESC,
      ac.created_at DESC
  )
  SELECT
    lra.user_id,
    pl.latitude::double precision,
    pl.longitude::double precision,
    pl.updated_at,
    pf.apodo,
    pf.estado::text,
    COALESCE(pf.provider_type::text, 'ruta') AS provider_type,
    p.nombre AS route_name,
    COALESCE(p.route_type, 'privada') AS route_type,
    p.id AS route_producto_id,
    p.proveedor_id,
    pr.nombre AS empresa_name,
    NULL::text AS unit_name,
    NULL::text AS unit_placas,
    NULL::text AS unit_descripcion,
    NULL::text AS driver_name
  FROM latest_route_assignments lra
  JOIN public.productos p ON p.id = lra.producto_id
  JOIN public.proveedor_locations pl ON pl.user_id = lra.user_id
  JOIN public.profiles pf ON pf.user_id = lra.user_id
  LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE pf.estado IN ('available', 'busy');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_route_live_units(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_route_live_units(uuid) TO anon, authenticated;