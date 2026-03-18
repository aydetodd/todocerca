
-- FIX 1: Prevent privilege escalation on profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- FIX 2: Fix pedidos public access
DROP POLICY IF EXISTS "Todos pueden ver pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Anyone can view pedidos" ON public.pedidos;

CREATE POLICY "Customers and providers can view their orders"
  ON public.pedidos FOR SELECT
  TO authenticated
  USING (
    cliente_user_id = auth.uid()
    OR public.is_proveedor_owner(proveedor_id, auth.uid())
    OR public.is_admin()
  );
