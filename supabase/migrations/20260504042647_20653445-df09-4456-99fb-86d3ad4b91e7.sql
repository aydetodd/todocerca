
-- =========================================================
-- 1) PROFILES: ocultar columnas sensibles a otros usuarios
-- =========================================================
REVOKE SELECT (phone_verification_code, verification_code, recovery_email, contact_token)
  ON public.profiles FROM anon, authenticated;

-- =========================================================
-- 2) CHOFERES_EMPRESA: eliminar lectura abierta
-- =========================================================
DROP POLICY IF EXISTS anyone_can_read_by_invite_token ON public.choferes_empresa;

CREATE POLICY "Driver self can read own record"
  ON public.choferes_empresa FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RPC seguro para resolver invitación por token (acceso anónimo permitido controladamente)
CREATE OR REPLACE FUNCTION public.get_chofer_by_invite_token(p_token uuid)
RETURNS TABLE (
  id uuid,
  proveedor_id uuid,
  nombre text,
  telefono text,
  is_active boolean,
  invite_token uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, proveedor_id, nombre, telefono, is_active, invite_token
  FROM public.choferes_empresa
  WHERE invite_token = p_token
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_chofer_by_invite_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chofer_by_invite_token(uuid) TO anon, authenticated;

-- =========================================================
-- 3) TRACKING_INVITATIONS: eliminar lectura abierta + RPC
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.tracking_invitations;
DROP POLICY IF EXISTS "Users can update invitation status by token" ON public.tracking_invitations;

CREATE OR REPLACE FUNCTION public.get_tracking_invitation_by_token(p_token uuid)
RETURNS SETOF public.tracking_invitations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.tracking_invitations
  WHERE invite_token = p_token
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_tracking_invitation_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracking_invitation_by_token(uuid) TO anon, authenticated;

-- Mantener acceso UPDATE solo si el usuario autenticado coincide por teléfono con la invitación
CREATE POLICY "Invitee can update own invitation status"
  ON public.tracking_invitations FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND public.normalize_phone(p.telefono) = public.normalize_phone(tracking_invitations.phone_number)
    )
  );

-- =========================================================
-- 4) MESSAGES: no exponer panic messages globalmente
-- =========================================================
DROP POLICY IF EXISTS "Users can view their own messages and panic messages" ON public.messages;

CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- =========================================================
-- 5) SOS_ALERTS: quitar SELECT público (existe RPC get_sos_by_token)
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view active SOS with valid token" ON public.sos_alerts;
GRANT EXECUTE ON FUNCTION public.get_sos_by_token(uuid) TO anon, authenticated;

-- =========================================================
-- 6) CLIENTES: eliminar policy abierta
-- =========================================================
DROP POLICY IF EXISTS "Users can view all clientes" ON public.clientes;

-- =========================================================
-- 7) ITEMS_PEDIDO: restringir lectura
-- =========================================================
DROP POLICY IF EXISTS "Todos pueden ver items de pedido" ON public.items_pedido;

CREATE POLICY "Order parties can view items"
  ON public.items_pedido FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_id
      WHERE p.id = items_pedido.pedido_id
      AND (p.cliente_user_id = auth.uid() OR pr.user_id = auth.uid())
    )
  );

-- =========================================================
-- 8) Storage credenciales -> privado + lectura restringida
-- =========================================================
UPDATE storage.buckets SET public = false WHERE id = 'credenciales';

DROP POLICY IF EXISTS "Public read credentials" ON storage.objects;

CREATE POLICY "Owner reads own credential files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'credenciales' AND owner = auth.uid()
  );

CREATE POLICY "Admin maestro reads all credential files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'credenciales' AND public.is_admin()
  );

-- =========================================================
-- 9) GPS / códigos: solo service_role inserta
-- =========================================================
DROP POLICY IF EXISTS "Service role can insert locations" ON public.gps_tracker_locations;
CREATE POLICY "Service role inserts tracker locations"
  ON public.gps_tracker_locations FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can request verification codes" ON public.phone_verification_codes;
CREATE POLICY "Service role inserts verification codes"
  ON public.phone_verification_codes FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can request recovery codes" ON public.password_recovery_codes;
CREATE POLICY "Service role inserts recovery codes"
  ON public.password_recovery_codes FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =========================================================
-- 10) Funciones: fijar search_path
-- =========================================================
ALTER FUNCTION public.auto_activate_proveedor() SET search_path = public;
ALTER FUNCTION public.is_empresa_transporte_admin(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.cleanup_member_location() SET search_path = public;
ALTER FUNCTION public.get_geografia_completa(uuid) SET search_path = public;
ALTER FUNCTION public.get_nivel2_by_slugs(varchar, varchar, varchar) SET search_path = public;

-- =========================================================
-- 11) Revocar EXECUTE a anon en funciones sensibles
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.get_user_email_by_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_user_by_phone(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.add_bidirectional_contact(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_qr_ticket_by_short_code(text) FROM anon, public;
