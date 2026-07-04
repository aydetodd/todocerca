
-- Trigger: cuando se inserta/actualiza una ruta foránea con trazado,
-- auto-vincular a maestra existente o auto-crear una maestra aprobada.
CREATE OR REPLACE FUNCTION public.tg_productos_auto_ruta_maestra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text;
  _master public.rutas_foraneas_maestras;
  _new_id uuid;
BEGIN
  -- Solo aplica a foráneas con trazado y sin maestra vinculada
  IF NEW.route_type IS DISTINCT FROM 'foranea' THEN
    RETURN NEW;
  END IF;
  IF NEW.route_geojson IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.ruta_maestra_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(btrim(NEW.nombre), '') = '' THEN
    RETURN NEW;
  END IF;

  _norm := public.normalize_route_name(NEW.nombre);
  IF _norm = '' THEN
    RETURN NEW;
  END IF;

  -- 1) ¿Existe maestra aprobada con el mismo nombre normalizado?
  SELECT * INTO _master
  FROM public.rutas_foraneas_maestras
  WHERE nombre_normalizado = _norm
    AND estado = 'approved'
  ORDER BY created_at ASC
  LIMIT 1;

  IF _master.id IS NOT NULL THEN
    -- Vincular al maestro existente y heredar todo
    NEW.ruta_maestra_id := _master.id;
    NEW.nombre := _master.nombre;
    NEW.route_geojson := _master.route_geojson;
    NEW.route_origin_lat := _master.route_origin_lat;
    NEW.route_origin_lng := _master.route_origin_lng;
    NEW.route_destination_lat := _master.route_destination_lat;
    NEW.route_destination_lng := _master.route_destination_lng;
    NEW.route_geofence_radius_m := _master.route_geofence_radius_m;
    RETURN NEW;
  END IF;

  -- 2) No existe: crear maestra APROBADA con los datos del propio concesionario
  --    Requiere que el producto tenga proveedor y creador identificable.
  INSERT INTO public.rutas_foraneas_maestras (
    nombre,
    nombre_normalizado,
    route_geojson,
    route_origin_lat,
    route_origin_lng,
    route_destination_lat,
    route_destination_lng,
    route_geofence_radius_m,
    estado,
    created_by_user_id,
    created_by_proveedor_id,
    approved_by,
    approved_at
  )
  VALUES (
    btrim(NEW.nombre),
    _norm,
    NEW.route_geojson,
    NEW.route_origin_lat,
    NEW.route_origin_lng,
    NEW.route_destination_lat,
    NEW.route_destination_lng,
    COALESCE(NEW.route_geofence_radius_m, 150),
    'approved',
    COALESCE(
      (SELECT user_id FROM public.proveedores WHERE id = NEW.proveedor_id),
      auth.uid()
    ),
    NEW.proveedor_id,
    COALESCE(
      (SELECT user_id FROM public.proveedores WHERE id = NEW.proveedor_id),
      auth.uid()
    ),
    now()
  )
  RETURNING id INTO _new_id;

  NEW.ruta_maestra_id := _new_id;
  RETURN NEW;

EXCEPTION WHEN unique_violation THEN
  -- Carrera: otro concesionario acaba de crear la maestra, vincular a esa.
  SELECT * INTO _master
  FROM public.rutas_foraneas_maestras
  WHERE nombre_normalizado = _norm
    AND estado IN ('approved','pending')
  ORDER BY created_at ASC
  LIMIT 1;
  IF _master.id IS NOT NULL THEN
    NEW.ruta_maestra_id := _master.id;
    NEW.nombre := _master.nombre;
    NEW.route_geojson := _master.route_geojson;
    NEW.route_origin_lat := _master.route_origin_lat;
    NEW.route_origin_lng := _master.route_origin_lng;
    NEW.route_destination_lat := _master.route_destination_lat;
    NEW.route_destination_lng := _master.route_destination_lng;
    NEW.route_geofence_radius_m := _master.route_geofence_radius_m;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_auto_ruta_maestra ON public.productos;
CREATE TRIGGER trg_productos_auto_ruta_maestra
BEFORE INSERT OR UPDATE OF route_geojson, nombre, route_type
ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.tg_productos_auto_ruta_maestra();

-- Backfill: promover rutas foráneas existentes con trazado que no tengan maestra
DO $$
DECLARE
  _p RECORD;
  _norm text;
  _master_id uuid;
  _owner uuid;
BEGIN
  FOR _p IN
    SELECT p.*
    FROM public.productos p
    WHERE p.route_type = 'foranea'
      AND p.route_geojson IS NOT NULL
      AND p.ruta_maestra_id IS NULL
      AND COALESCE(btrim(p.nombre), '') <> ''
    ORDER BY p.created_at ASC
  LOOP
    _norm := public.normalize_route_name(_p.nombre);
    IF _norm = '' THEN CONTINUE; END IF;

    SELECT id INTO _master_id
    FROM public.rutas_foraneas_maestras
    WHERE nombre_normalizado = _norm AND estado = 'approved'
    LIMIT 1;

    IF _master_id IS NULL THEN
      SELECT user_id INTO _owner FROM public.proveedores WHERE id = _p.proveedor_id;
      INSERT INTO public.rutas_foraneas_maestras (
        nombre, nombre_normalizado, route_geojson,
        route_origin_lat, route_origin_lng,
        route_destination_lat, route_destination_lng,
        route_geofence_radius_m, estado,
        created_by_user_id, created_by_proveedor_id,
        approved_by, approved_at
      ) VALUES (
        btrim(_p.nombre), _norm, _p.route_geojson,
        _p.route_origin_lat, _p.route_origin_lng,
        _p.route_destination_lat, _p.route_destination_lng,
        COALESCE(_p.route_geofence_radius_m, 150), 'approved',
        _owner, _p.proveedor_id, _owner, now()
      )
      RETURNING id INTO _master_id;
    END IF;

    UPDATE public.productos
    SET ruta_maestra_id = _master_id
    WHERE id = _p.id;
  END LOOP;
END$$;
