
-- 1) PROFILES: drop broad cross-user SELECT policy
DROP POLICY IF EXISTS "Users can view public profile info" ON public.profiles;

-- 2) PROVEEDORES: collapse public read policies and revoke sensitive cols from anon
DROP POLICY IF EXISTS "Anyone can view proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "Everyone can view proveedores" ON public.proveedores;

-- Anon: read directory but no contact details
CREATE POLICY "Anon can view proveedores directory"
ON public.proveedores FOR SELECT TO anon USING (true);

-- Authenticated: full read (contact visible only to logged-in users)
CREATE POLICY "Authenticated can view proveedores"
ON public.proveedores FOR SELECT TO authenticated USING (true);

REVOKE SELECT (email, telefono, business_phone) ON public.proveedores FROM anon;

-- 3) Verification / recovery codes: block client SELECT
DROP POLICY IF EXISTS "Users can view their own verification codes" ON public.device_verification_codes;
DROP POLICY IF EXISTS "Users can view own recovery codes" ON public.password_recovery_codes;

-- 4) Storage 'credenciales': owner-scoped UPDATE / DELETE
CREATE POLICY "Owners can update own credenciales"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'credenciales' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'credenciales' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners can delete own credenciales"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'credenciales' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5) CITAS: require valid proveedor on insert
DROP POLICY IF EXISTS "Usuarios pueden crear citas" ON public.citas;
CREATE POLICY "Usuarios pueden crear citas"
ON public.citas FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.proveedores p WHERE p.id = proveedor_id)
  AND (cliente_user_id IS NULL OR cliente_user_id = auth.uid())
);
