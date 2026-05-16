CREATE OR REPLACE FUNCTION public.get_public_route_live_units(_producto_id uuid)
 RETURNS TABLE(user_id uuid, latitude double precision, longitude double precision, updated_at timestamp with time zone, apodo text, estado text, provider_type text, route_name text, route_type text, route_producto_id uuid, proveedor_id uuid, empresa_name text, unit_name text, unit_placas text, unit_descripcion text, driver_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ),
  -- Todos los productos (de cualquier concesionario) que representan la misma ruta pública en la misma ciudad/estado
  matching_products AS (
    SELECT p.id, p.nombre, p.proveedor_id, COALESCE(p.route_type, 'urbana') AS route_type
    FROM public.productos p
    JOIN target t ON regexp_replace(lower(COALESCE(p.nombre, '')), '[^a-z0-9]+', '', 'g') = t.normalized_name
      AND COALESCE(p.route_type, 'urbana') = t.route_type
      AND COALESCE(p.is_private, false) = false
      AND COALESCE(p.estado, '') IS NOT DISTINCT FROM COALESCE(t.estado, '')
      AND COALESCE(p.ciudad, '') IS NOT DISTINCT FROM COALESCE(t.ciudad, '')
  ),
  -- Para cada chofer activo, tomar SOLO su asignación más reciente de HOY (sin importar a qué ruta).
  -- Si esa asignación no corresponde a esta ruta, el chofer NO debe aparecer aquí.
  latest_today_assignment_per_driver AS (
    SELECT DISTINCT ON (ce.user_id)
      ce.user_id,
      ac.producto_id,
      ac.unidad_id,
      ce.nombre AS driver_name
    FROM public.asignaciones_chofer ac
    JOIN public.choferes_empresa ce ON ce.id = ac.chofer_id
    WHERE ce.is_active = true
      AND ce.user_id IS NOT NULL
      AND COALESCE(ce.transport_type, 'publico') <> 'taxi'
      AND ac.fecha = ((now() AT TIME ZONE 'America/Hermosillo')::date)
    ORDER BY ce.user_id, ac.created_at DESC
  ),
  route_users AS (
    SELECT lta.user_id, lta.producto_id, lta.unidad_id, lta.driver_name
    FROM latest_today_assignment_per_driver lta
    JOIN matching_products mp ON mp.id = lta.producto_id
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
$function$;