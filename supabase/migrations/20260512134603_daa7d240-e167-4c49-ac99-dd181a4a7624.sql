CREATE OR REPLACE FUNCTION public.get_public_route_live_units(_producto_id uuid)
RETURNS TABLE (
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
    SELECT p.id, p.nombre, p.proveedor_id, COALESCE(p.route_type, 'urbana') AS route_type
    FROM public.productos p
    WHERE p.id = _producto_id
      AND COALESCE(p.is_private, false) = false
      AND COALESCE(p.route_type, 'urbana') IN ('urbana', 'foranea')
  ), latest_route_assignments AS (
    SELECT DISTINCT ON (ce.user_id)
      ce.user_id,
      ac.producto_id,
      ac.unidad_id,
      ce.nombre AS driver_name
    FROM public.asignaciones_chofer ac
    JOIN public.choferes_empresa ce ON ce.id = ac.chofer_id
    JOIN target t ON t.id = ac.producto_id
    WHERE ce.is_active = true
      AND ce.user_id IS NOT NULL
    ORDER BY
      ce.user_id,
      CASE WHEN ac.fecha = ((now() AT TIME ZONE 'America/Hermosillo')::date) THEN 0 ELSE 1 END,
      ac.fecha DESC,
      ac.created_at DESC
  ), provider_profile_match AS (
    SELECT
      pr.user_id,
      t.id AS producto_id,
      NULL::uuid AS unidad_id,
      NULL::text AS driver_name
    FROM target t
    JOIN public.proveedores pr ON pr.id = t.proveedor_id
    JOIN public.profiles pf ON pf.user_id = pr.user_id
    WHERE regexp_replace(lower(COALESCE(pf.route_name, '')), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(COALESCE(t.nombre, '')), '[^a-z0-9]+', '', 'g')
  ), route_users AS (
    SELECT * FROM latest_route_assignments
    UNION
    SELECT * FROM provider_profile_match
  )
  SELECT
    ru.user_id,
    pl.latitude::double precision,
    pl.longitude::double precision,
    pl.updated_at,
    pf.apodo,
    pf.estado::text,
    pf.provider_type::text,
    t.nombre AS route_name,
    t.route_type,
    t.id AS route_producto_id,
    t.proveedor_id,
    pr.nombre AS empresa_name,
    ue.nombre AS unit_name,
    ue.placas AS unit_placas,
    ue.descripcion AS unit_descripcion,
    ru.driver_name
  FROM route_users ru
  JOIN target t ON t.id = ru.producto_id
  JOIN public.proveedor_locations pl ON pl.user_id = ru.user_id
  JOIN public.profiles pf ON pf.user_id = ru.user_id
  LEFT JOIN public.proveedores pr ON pr.id = t.proveedor_id
  LEFT JOIN public.unidades_empresa ue ON ue.id = ru.unidad_id
  WHERE pf.role = 'proveedor'
    AND pf.estado IN ('available', 'busy');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_route_live_units(uuid) TO anon, authenticated;