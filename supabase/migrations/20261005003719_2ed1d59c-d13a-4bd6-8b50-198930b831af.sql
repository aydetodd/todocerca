-- 1) Códigos de descuento del 100% para activar proveedor
CREATE TABLE public.codigos_descuento_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  usado boolean NOT NULL DEFAULT false,
  usado_por uuid,
  usado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_descuento_proveedor TO authenticated;
GRANT ALL ON public.codigos_descuento_proveedor TO service_role;
ALTER TABLE public.codigos_descuento_proveedor ENABLE ROW LEVEL SECURITY;
-- Solo el administrador ve y administra los códigos; los usuarios los canjean vía función segura
CREATE POLICY "Admin administra códigos" ON public.codigos_descuento_proveedor
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) Estado de suscripción anual en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suscripcion_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suscripcion_expira_en timestamptz;

-- Proveedores existentes (concesionarios) quedan activos un año para no ocultarlos
UPDATE public.profiles SET suscripcion_activa = true, suscripcion_expira_en = now() + interval '1 year'
WHERE role::text = 'proveedor' AND suscripcion_activa = false;

-- 3) Activación interna (la usan el canje de código y el pago)
CREATE OR REPLACE FUNCTION public.activar_proveedor_interno(_uid uuid, _tipo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record;
BEGIN
  IF _tipo NOT IN ('concesionario','anexo_escuela','oficios','gasolinera','otro') THEN
    RAISE EXCEPTION 'Tipo de proveedor no válido';
  END IF;
  SELECT * INTO _p FROM public.profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
  UPDATE public.profiles SET
    tipo_proveedor = _tipo,
    role = CASE WHEN role::text = 'admin' THEN role ELSE 'proveedor' END,
    suscripcion_activa = true,
    suscripcion_expira_en = now() + interval '1 year'
  WHERE user_id = _uid;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE user_id = _uid) THEN
    INSERT INTO public.proveedores (user_id, nombre, telefono)
    VALUES (_uid, COALESCE(NULLIF(_p.nombre, ''), 'Proveedor'), _p.phone);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.activar_proveedor_interno(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_proveedor_interno(uuid, text) TO service_role;

-- 4) Canjear código: valida, lo marca usado y activa (todo junto)
CREATE OR REPLACE FUNCTION public.canjear_codigo_proveedor(_codigo text, _tipo text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _c record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO _c FROM public.codigos_descuento_proveedor
   WHERE upper(codigo) = upper(trim(_codigo)) FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'Código no válido'); END IF;
  IF _c.usado THEN RETURN json_build_object('ok', false, 'error', 'Este código ya fue usado'); END IF;
  IF _c.expira_en IS NOT NULL AND _c.expira_en < now() THEN
    RETURN json_build_object('ok', false, 'error', 'Este código ya expiró');
  END IF;
  UPDATE public.codigos_descuento_proveedor SET usado = true, usado_por = _uid, usado_en = now() WHERE id = _c.id;
  PERFORM public.activar_proveedor_interno(_uid, _tipo);
  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.canjear_codigo_proveedor(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canjear_codigo_proveedor(text, text) TO authenticated, service_role;

-- 5) Revisar un código sin gastarlo (para desbloquear el botón)
CREATE OR REPLACE FUNCTION public.revisar_codigo_proveedor(_codigo text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO _c FROM public.codigos_descuento_proveedor WHERE upper(codigo) = upper(trim(_codigo));
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'Código no válido'); END IF;
  IF _c.usado THEN RETURN json_build_object('ok', false, 'error', 'Este código ya fue usado'); END IF;
  IF _c.expira_en IS NOT NULL AND _c.expira_en < now() THEN RETURN json_build_object('ok', false, 'error', 'Este código ya expiró'); END IF;
  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.revisar_codigo_proveedor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_codigo_proveedor(text) TO authenticated, service_role;

-- 6) set_tipo_proveedor ya NO activa gratis: solo cambia el tipo si la suscripción está vigente
CREATE OR REPLACE FUNCTION public.set_tipo_proveedor(_tipo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tipo NOT IN ('concesionario','anexo_escuela','oficios','gasolinera','otro') THEN
    RAISE EXCEPTION 'Tipo de proveedor no válido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND suscripcion_activa
                 AND (suscripcion_expira_en IS NULL OR suscripcion_expira_en > now())) THEN
    RAISE EXCEPTION 'Suscripción no activa';
  END IF;
  UPDATE public.profiles SET tipo_proveedor = _tipo WHERE user_id = _uid;
END; $$;

-- 7) Consulta pública: ¿el proveedor tiene suscripción vigente?
CREATE OR REPLACE FUNCTION public.proveedor_suscripcion_activa(_proveedor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.suscripcion_activa AND (p.suscripcion_expira_en IS NULL OR p.suscripcion_expira_en > now())
    FROM public.proveedores pr JOIN public.profiles p ON p.user_id = pr.user_id
    WHERE pr.id = _proveedor_id), false);
$$;
GRANT EXECUTE ON FUNCTION public.proveedor_suscripcion_activa(uuid) TO anon, authenticated, service_role;