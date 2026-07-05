-- ============================================================
-- Solicitudes de cambio a rutas maestras foráneas
-- Cualquier concesionario puede pedir renombrar / cambiar trazado /
-- geocercas / precio de una ruta maestra aprobada. Queda evidencia
-- con sus datos y llega al admin por bandeja interna.
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.ruta_solicitud_tipo AS ENUM ('renombrar','trazado','geocercas','precio','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ruta_solicitud_estado AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marca en la ruta maestra
ALTER TABLE public.rutas_foraneas_maestras
  ADD COLUMN IF NOT EXISTS tiene_cambio_pendiente boolean NOT NULL DEFAULT false;

-- Tabla principal
CREATE TABLE IF NOT EXISTS public.ruta_maestra_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_maestra_id uuid NOT NULL REFERENCES public.rutas_foraneas_maestras(id) ON DELETE CASCADE,
  solicitante_user_id uuid NOT NULL,
  solicitante_nombre text,
  solicitante_qard text,
  solicitante_telefono text,
  solicitante_proveedor_id uuid,
  tipo_cambio public.ruta_solicitud_tipo NOT NULL,
  propuesta jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text NOT NULL,
  estado public.ruta_solicitud_estado NOT NULL DEFAULT 'pending',
  admin_user_id uuid,
  admin_resuelto_at timestamptz,
  admin_motivo_rechazo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ruta_maestra_solicitudes_ruta ON public.ruta_maestra_solicitudes(ruta_maestra_id);
CREATE INDEX IF NOT EXISTS idx_ruta_maestra_solicitudes_solicitante ON public.ruta_maestra_solicitudes(solicitante_user_id);
CREATE INDEX IF NOT EXISTS idx_ruta_maestra_solicitudes_estado ON public.ruta_maestra_solicitudes(estado);

GRANT SELECT, INSERT ON public.ruta_maestra_solicitudes TO authenticated;
GRANT ALL ON public.ruta_maestra_solicitudes TO service_role;

ALTER TABLE public.ruta_maestra_solicitudes ENABLE ROW LEVEL SECURITY;

-- Concesionario ve sus propias solicitudes
CREATE POLICY "solicitante_select_own" ON public.ruta_maestra_solicitudes
  FOR SELECT TO authenticated
  USING (solicitante_user_id = auth.uid());

-- Concesionario crea su propia solicitud
CREATE POLICY "solicitante_insert_own" ON public.ruta_maestra_solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_user_id = auth.uid());

-- Admin ve todas
CREATE POLICY "admin_select_all" ON public.ruta_maestra_solicitudes
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Admin actualiza (resuelve)
CREATE POLICY "admin_update_all" ON public.ruta_maestra_solicitudes
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Updated_at
CREATE OR REPLACE FUNCTION public.tg_ruta_solicitud_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ruta_solicitud_touch ON public.ruta_maestra_solicitudes;
CREATE TRIGGER trg_ruta_solicitud_touch
BEFORE UPDATE ON public.ruta_maestra_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.tg_ruta_solicitud_touch();

-- Auto-snapshot del solicitante + marcar ruta pendiente + notificar admin
CREATE OR REPLACE FUNCTION public.tg_ruta_solicitud_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prof RECORD;
  _prov_id uuid;
BEGIN
  SELECT p.nombre, p.apodo, p.qard_number, p.phone, p.telefono
    INTO _prof
  FROM public.profiles p
  WHERE p.user_id = NEW.solicitante_user_id;

  NEW.solicitante_nombre   := COALESCE(NEW.solicitante_nombre, _prof.apodo, _prof.nombre);
  NEW.solicitante_qard     := COALESCE(NEW.solicitante_qard, _prof.qard_number);
  NEW.solicitante_telefono := COALESCE(NEW.solicitante_telefono, _prof.phone, _prof.telefono);

  IF NEW.solicitante_proveedor_id IS NULL THEN
    SELECT id INTO _prov_id FROM public.proveedores WHERE user_id = NEW.solicitante_user_id LIMIT 1;
    NEW.solicitante_proveedor_id := _prov_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ruta_solicitud_before_insert ON public.ruta_maestra_solicitudes;
CREATE TRIGGER trg_ruta_solicitud_before_insert
BEFORE INSERT ON public.ruta_maestra_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.tg_ruta_solicitud_before_insert();

CREATE OR REPLACE FUNCTION public.tg_ruta_solicitud_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id uuid;
  _ruta_nombre text;
  _tipo text;
BEGIN
  -- Marca la ruta como "con cambio pendiente" (sigue operando)
  UPDATE public.rutas_foraneas_maestras
    SET tiene_cambio_pendiente = true
  WHERE id = NEW.ruta_maestra_id
  RETURNING nombre INTO _ruta_nombre;

  -- Bandeja interna del admin
  SELECT user_id INTO _admin_id FROM public.profiles WHERE consecutive_number = 1 LIMIT 1;

  _tipo := CASE NEW.tipo_cambio
    WHEN 'renombrar' THEN 'renombrar'
    WHEN 'trazado'   THEN 'cambiar trazado'
    WHEN 'geocercas' THEN 'ajustar geocercas A/B'
    WHEN 'precio'    THEN 'cambiar precio'
    ELSE 'otro cambio'
  END;

  IF _admin_id IS NOT NULL THEN
    INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
    VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      _admin_id,
      format(
        E'📝 Solicitud de cambio en ruta maestra\n\nRuta: %s\nTipo: %s\nConcesionario: %s (QaRd %s, tel %s)\nMotivo: %s\n\nRevisa en Panel → Rutas Foráneas Maestras.',
        COALESCE(_ruta_nombre,'—'),
        _tipo,
        COALESCE(NEW.solicitante_nombre,'—'),
        COALESCE(NEW.solicitante_qard,'—'),
        COALESCE(NEW.solicitante_telefono,'—'),
        NEW.motivo
      ),
      false
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ruta_solicitud_after_insert ON public.ruta_maestra_solicitudes;
CREATE TRIGGER trg_ruta_solicitud_after_insert
AFTER INSERT ON public.ruta_maestra_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.tg_ruta_solicitud_after_insert();

-- =========================================================
-- RPCs admin: aprobar / rechazar
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_approve_solicitud_cambio(_id uuid)
RETURNS public.ruta_maestra_solicitudes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sol public.ruta_maestra_solicitudes;
  _prop jsonb;
  _still_pending int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede aprobar solicitudes';
  END IF;

  SELECT * INTO _sol FROM public.ruta_maestra_solicitudes WHERE id = _id;
  IF _sol.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF _sol.estado <> 'pending' THEN RAISE EXCEPTION 'La solicitud ya fue resuelta'; END IF;

  _prop := _sol.propuesta;

  -- Aplicar cambios según tipo
  IF _sol.tipo_cambio = 'renombrar' AND _prop ? 'nombre' THEN
    UPDATE public.rutas_foraneas_maestras
      SET nombre = _prop->>'nombre'
    WHERE id = _sol.ruta_maestra_id;
  ELSIF _sol.tipo_cambio = 'trazado' AND _prop ? 'route_geojson' THEN
    UPDATE public.rutas_foraneas_maestras
      SET route_geojson = _prop->'route_geojson'
    WHERE id = _sol.ruta_maestra_id;
  ELSIF _sol.tipo_cambio = 'geocercas' THEN
    UPDATE public.rutas_foraneas_maestras
      SET route_origin_lat      = COALESCE((_prop->>'origin_lat')::numeric,      route_origin_lat),
          route_origin_lng      = COALESCE((_prop->>'origin_lng')::numeric,      route_origin_lng),
          route_destination_lat = COALESCE((_prop->>'destination_lat')::numeric, route_destination_lat),
          route_destination_lng = COALESCE((_prop->>'destination_lng')::numeric, route_destination_lng),
          route_geofence_radius_m = COALESCE((_prop->>'radius_m')::int,          route_geofence_radius_m)
    WHERE id = _sol.ruta_maestra_id;
  END IF;
  -- 'precio' y 'otro' quedan como registro; el admin ajusta manualmente si aplica.

  UPDATE public.ruta_maestra_solicitudes
    SET estado = 'approved',
        admin_user_id = auth.uid(),
        admin_resuelto_at = now()
  WHERE id = _id
  RETURNING * INTO _sol;

  -- Si ya no quedan pendientes en la ruta, quitar el flag
  SELECT count(*) INTO _still_pending
  FROM public.ruta_maestra_solicitudes
  WHERE ruta_maestra_id = _sol.ruta_maestra_id AND estado = 'pending';

  IF _still_pending = 0 THEN
    UPDATE public.rutas_foraneas_maestras
      SET tiene_cambio_pendiente = false
    WHERE id = _sol.ruta_maestra_id;
  END IF;

  -- Notificar al solicitante
  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    _sol.solicitante_user_id,
    format('✅ Tu solicitud de cambio (%s) en la ruta maestra fue APROBADA.', _sol.tipo_cambio),
    false
  );

  RETURN _sol;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_solicitud_cambio(_id uuid, _motivo text)
RETURNS public.ruta_maestra_solicitudes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sol public.ruta_maestra_solicitudes;
  _still_pending int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede rechazar solicitudes';
  END IF;
  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo del rechazo es obligatorio';
  END IF;

  UPDATE public.ruta_maestra_solicitudes
    SET estado = 'rejected',
        admin_user_id = auth.uid(),
        admin_resuelto_at = now(),
        admin_motivo_rechazo = _motivo
  WHERE id = _id AND estado = 'pending'
  RETURNING * INTO _sol;

  IF _sol.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada o ya resuelta'; END IF;

  SELECT count(*) INTO _still_pending
  FROM public.ruta_maestra_solicitudes
  WHERE ruta_maestra_id = _sol.ruta_maestra_id AND estado = 'pending';

  IF _still_pending = 0 THEN
    UPDATE public.rutas_foraneas_maestras
      SET tiene_cambio_pendiente = false
    WHERE id = _sol.ruta_maestra_id;
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    _sol.solicitante_user_id,
    format('❌ Tu solicitud de cambio (%s) en la ruta maestra fue RECHAZADA.\nMotivo: %s', _sol.tipo_cambio, _motivo),
    false
  );

  RETURN _sol;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_approve_solicitud_cambio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_solicitud_cambio(uuid, text) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ruta_maestra_solicitudes;