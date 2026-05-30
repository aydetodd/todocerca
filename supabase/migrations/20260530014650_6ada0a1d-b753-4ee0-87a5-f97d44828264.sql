
-- Tabla maestra de rutas foráneas compartidas
CREATE TABLE public.rutas_foraneas_maestras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  nombre_normalizado text NOT NULL,
  route_geojson jsonb NOT NULL,
  route_origin_lat numeric,
  route_origin_lng numeric,
  route_destination_lat numeric,
  route_destination_lng numeric,
  route_geofence_radius_m integer NOT NULL DEFAULT 150,
  estado text NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','approved','rejected')),
  created_by_user_id uuid NOT NULL,
  created_by_proveedor_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  rechazo_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rutas_foraneas_maestras_nombre_uniq
  ON public.rutas_foraneas_maestras (nombre_normalizado)
  WHERE estado IN ('pending','approved');

GRANT SELECT, INSERT, UPDATE ON public.rutas_foraneas_maestras TO authenticated;
GRANT ALL ON public.rutas_foraneas_maestras TO service_role;

ALTER TABLE public.rutas_foraneas_maestras ENABLE ROW LEVEL SECURITY;

-- SELECT: aprobadas son visibles para todos los autenticados
CREATE POLICY "Maestras aprobadas visibles a autenticados"
ON public.rutas_foraneas_maestras
FOR SELECT
TO authenticated
USING (estado = 'approved');

-- SELECT: creador ve sus propias en cualquier estado
CREATE POLICY "Creador ve sus propuestas"
ON public.rutas_foraneas_maestras
FOR SELECT
TO authenticated
USING (created_by_user_id = auth.uid());

-- SELECT: admin ve todas
CREATE POLICY "Admin ve todas las maestras"
ON public.rutas_foraneas_maestras
FOR SELECT
TO authenticated
USING (public.is_admin());

-- INSERT: cualquier autenticado puede proponer (trigger normaliza)
CREATE POLICY "Autenticados proponen maestras"
ON public.rutas_foraneas_maestras
FOR INSERT
TO authenticated
WITH CHECK (created_by_user_id = auth.uid());

-- UPDATE: creador solo si sigue pending; admin siempre
CREATE POLICY "Creador edita su pendiente"
ON public.rutas_foraneas_maestras
FOR UPDATE
TO authenticated
USING (created_by_user_id = auth.uid() AND estado = 'pending')
WITH CHECK (created_by_user_id = auth.uid() AND estado = 'pending');

CREATE POLICY "Admin edita maestras"
ON public.rutas_foraneas_maestras
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admin elimina maestras"
ON public.rutas_foraneas_maestras
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Trigger updated_at
CREATE TRIGGER trg_rutas_foraneas_maestras_updated
BEFORE UPDATE ON public.rutas_foraneas_maestras
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Función para normalizar nombre
CREATE OR REPLACE FUNCTION public.normalize_route_name(_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    translate(lower(coalesce(_nombre,'')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+', '', 'g'
  )
$$;

-- Trigger: normaliza nombre, fuerza estado pending al insertar
CREATE OR REPLACE FUNCTION public.tg_rutas_maestras_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nombre := btrim(NEW.nombre);
  NEW.nombre_normalizado := public.normalize_route_name(NEW.nombre);
  IF NEW.nombre_normalizado = '' THEN
    RAISE EXCEPTION 'El nombre de la ruta no puede estar vacío';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.estado := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rutas_maestras_before_write
BEFORE INSERT OR UPDATE ON public.rutas_foraneas_maestras
FOR EACH ROW EXECUTE FUNCTION public.tg_rutas_maestras_before_write();

-- Añadir vínculo en productos
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ruta_maestra_id uuid REFERENCES public.rutas_foraneas_maestras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_ruta_maestra_id ON public.productos(ruta_maestra_id);

-- Función: aprobar (admin)
CREATE OR REPLACE FUNCTION public.admin_approve_ruta_maestra(_id uuid, _nombre_final text DEFAULT NULL)
RETURNS public.rutas_foraneas_maestras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.rutas_foraneas_maestras;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede aprobar rutas maestras';
  END IF;

  UPDATE public.rutas_foraneas_maestras
  SET nombre = COALESCE(NULLIF(btrim(_nombre_final), ''), nombre),
      estado = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      rechazo_motivo = NULL
  WHERE id = _id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Ruta maestra no encontrada';
  END IF;

  RETURN _row;
END;
$$;

-- Función: rechazar (admin)
CREATE OR REPLACE FUNCTION public.admin_reject_ruta_maestra(_id uuid, _motivo text)
RETURNS public.rutas_foraneas_maestras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.rutas_foraneas_maestras;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede rechazar rutas maestras';
  END IF;

  UPDATE public.rutas_foraneas_maestras
  SET estado = 'rejected',
      rechazo_motivo = _motivo,
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = _id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Ruta maestra no encontrada';
  END IF;

  RETURN _row;
END;
$$;

-- Función: vincular producto foráneo a una maestra
CREATE OR REPLACE FUNCTION public.link_producto_to_ruta_maestra(_producto_id uuid, _maestra_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _master public.rutas_foraneas_maestras;
  _updated uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO _master FROM public.rutas_foraneas_maestras WHERE id = _maestra_id;
  IF _master.id IS NULL THEN
    RAISE EXCEPTION 'Ruta maestra no encontrada';
  END IF;

  IF _master.estado <> 'approved' AND _master.created_by_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No puedes vincular una ruta maestra que no está aprobada';
  END IF;

  UPDATE public.productos p
  SET ruta_maestra_id = _maestra_id,
      nombre = _master.nombre,
      route_geojson = _master.route_geojson,
      route_origin_lat = _master.route_origin_lat,
      route_origin_lng = _master.route_origin_lng,
      route_destination_lat = _master.route_destination_lat,
      route_destination_lng = _master.route_destination_lng,
      route_geofence_radius_m = _master.route_geofence_radius_m
  WHERE p.id = _producto_id
    AND p.route_type = 'foranea'
    AND public.is_proveedor_owner(p.proveedor_id, auth.uid())
  RETURNING p.id INTO _updated;

  IF _updated IS NULL THEN
    RAISE EXCEPTION 'No se pudo vincular: la ruta no es tuya o no es foránea';
  END IF;

  RETURN _updated;
END;
$$;

-- Función: desvincular producto de una maestra
CREATE OR REPLACE FUNCTION public.unlink_producto_from_ruta_maestra(_producto_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  UPDATE public.productos p
  SET ruta_maestra_id = NULL
  WHERE p.id = _producto_id
    AND public.is_proveedor_owner(p.proveedor_id, auth.uid())
  RETURNING p.id INTO _updated;

  IF _updated IS NULL THEN
    RAISE EXCEPTION 'No se pudo desvincular';
  END IF;

  RETURN _updated;
END;
$$;

-- Cuando se actualiza una maestra aprobada, propagar a productos vinculados
CREATE OR REPLACE FUNCTION public.tg_propagate_maestra_to_productos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'approved' THEN
    UPDATE public.productos
    SET nombre = NEW.nombre,
        route_geojson = NEW.route_geojson,
        route_origin_lat = NEW.route_origin_lat,
        route_origin_lng = NEW.route_origin_lng,
        route_destination_lat = NEW.route_destination_lat,
        route_destination_lng = NEW.route_destination_lng,
        route_geofence_radius_m = NEW.route_geofence_radius_m
    WHERE ruta_maestra_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_propagate_maestra
AFTER UPDATE ON public.rutas_foraneas_maestras
FOR EACH ROW
WHEN (OLD.route_geojson IS DISTINCT FROM NEW.route_geojson
   OR OLD.nombre IS DISTINCT FROM NEW.nombre
   OR OLD.route_origin_lat IS DISTINCT FROM NEW.route_origin_lat
   OR OLD.route_origin_lng IS DISTINCT FROM NEW.route_origin_lng
   OR OLD.route_destination_lat IS DISTINCT FROM NEW.route_destination_lat
   OR OLD.route_destination_lng IS DISTINCT FROM NEW.route_destination_lng
   OR OLD.route_geofence_radius_m IS DISTINCT FROM NEW.route_geofence_radius_m
   OR OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.tg_propagate_maestra_to_productos();

-- Realtime
ALTER TABLE public.rutas_foraneas_maestras REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rutas_foraneas_maestras;
