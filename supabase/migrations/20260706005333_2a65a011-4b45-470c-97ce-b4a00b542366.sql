
-- 1) Ventana de permiso en la solicitud
ALTER TABLE public.ruta_maestra_solicitudes
  ADD COLUMN IF NOT EXISTS permiso_expira_at timestamptz;

-- 2) Helper: ¿este usuario tiene permiso vigente para editar esta maestra?
CREATE OR REPLACE FUNCTION public.has_active_edit_permission(_user_id uuid, _ruta_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ruta_maestra_solicitudes
    WHERE solicitante_user_id = _user_id
      AND ruta_maestra_id = _ruta_id
      AND estado = 'approved'
      AND (permiso_expira_at IS NULL OR permiso_expira_at > now())
  )
$$;

-- 3) Política de edición para concesionario con permiso vigente
DROP POLICY IF EXISTS "Concesionario con permiso edita maestra" ON public.rutas_foraneas_maestras;
CREATE POLICY "Concesionario con permiso edita maestra"
ON public.rutas_foraneas_maestras
FOR UPDATE TO authenticated
USING (public.has_active_edit_permission(auth.uid(), id))
WITH CHECK (public.has_active_edit_permission(auth.uid(), id));

-- 4) Aprobar = otorgar permiso 7 días. Ya NO aplica cambios ni requiere propuesta.
CREATE OR REPLACE FUNCTION public.admin_approve_solicitud_cambio(_id uuid)
RETURNS ruta_maestra_solicitudes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sol public.ruta_maestra_solicitudes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede aprobar solicitudes';
  END IF;

  SELECT * INTO _sol FROM public.ruta_maestra_solicitudes WHERE id = _id;
  IF _sol.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF _sol.estado <> 'pending' THEN RAISE EXCEPTION 'La solicitud ya fue resuelta'; END IF;

  UPDATE public.ruta_maestra_solicitudes
    SET estado = 'approved',
        admin_user_id = auth.uid(),
        admin_resuelto_at = now(),
        permiso_expira_at = now() + interval '7 days'
  WHERE id = _id
  RETURNING * INTO _sol;

  INSERT INTO public.messages (sender_id, receiver_id, message, is_read)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    _sol.solicitante_user_id,
    format(
      E'✅ Autorización concedida\n\nTienes permiso para editar la ruta maestra directamente desde tu Catálogo Maestro durante 7 días.\nTipo solicitado: %s\nMotivo: %s\n\nQueda registro de tu solicitud como evidencia.',
      _sol.tipo_cambio, _sol.motivo
    ),
    false
  );

  RETURN _sol;
END $$;

-- 5) Marcar la ruta como sin cambio pendiente cuando ya no queden solicitudes 'pending'
CREATE OR REPLACE FUNCTION public.tg_ruta_solicitud_after_resolve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pend int;
BEGIN
  SELECT count(*) INTO _pend FROM public.ruta_maestra_solicitudes
    WHERE ruta_maestra_id = NEW.ruta_maestra_id AND estado = 'pending';
  IF _pend = 0 THEN
    UPDATE public.rutas_foraneas_maestras SET tiene_cambio_pendiente = false
      WHERE id = NEW.ruta_maestra_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ruta_solicitud_after_resolve ON public.ruta_maestra_solicitudes;
CREATE TRIGGER trg_ruta_solicitud_after_resolve
AFTER UPDATE OF estado ON public.ruta_maestra_solicitudes
FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.tg_ruta_solicitud_after_resolve();
