
-- 1) Revoke sensitive column access on profiles from anon/authenticated
REVOKE SELECT (phone_verification_code, verification_code, phone_verification_expires_at, recovery_email, contact_token, email)
  ON public.profiles FROM anon, authenticated, public;

-- 2) Tighten items_pedido INSERT
DROP POLICY IF EXISTS "Todos pueden crear items de pedido" ON public.items_pedido;
CREATE POLICY "Order parties can insert items"
  ON public.items_pedido
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_id
      WHERE p.id = items_pedido.pedido_id
        AND (p.cliente_user_id = auth.uid() OR pr.user_id = auth.uid())
    )
  );

-- 3) Fix mutable search_path
ALTER FUNCTION public.normalize_phone(text) SET search_path = public;

-- 4) Revoke EXECUTE on sensitive SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.get_user_email_by_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_user_by_phone(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.add_bidirectional_contact(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
