
-- 1) PROVEEDORES
DROP POLICY IF EXISTS "Anon can view proveedores directory" ON public.proveedores;
DROP VIEW IF EXISTS public.proveedores_publico CASCADE;
CREATE VIEW public.proveedores_publico
WITH (security_invoker = true) AS
SELECT id, nombre, description, latitude, longitude,
       business_address, codigo_postal, created_at
FROM public.proveedores;
GRANT SELECT ON public.proveedores_publico TO anon, authenticated;

-- 2) CLIENTES
DROP POLICY IF EXISTS "Admins and proveedores can view all clientes" ON public.clientes;
CREATE POLICY "Admins can view all clientes"
ON public.clientes FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Proveedores can view their own clientes via pedidos"
ON public.clientes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos pe
    JOIN public.proveedores pr ON pr.id = pe.proveedor_id
    WHERE pe.cliente_user_id = clientes.user_id
      AND pr.user_id = auth.uid()
  )
);

-- 3) STORAGE
DROP POLICY IF EXISTS "Users upload own credentials" ON storage.objects;
DROP POLICY IF EXISTS "Users read own credentials" ON storage.objects;
DROP POLICY IF EXISTS "Users update own credentials" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own credentials" ON storage.objects;

CREATE POLICY "Users upload own credentials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'credenciales'
  AND (storage.foldername(name))[1] = 'descuentos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
CREATE POLICY "Users read own credentials"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'credenciales'
  AND (storage.foldername(name))[1] = 'descuentos'
  AND ((storage.foldername(name))[2] = auth.uid()::text OR public.is_admin())
);
CREATE POLICY "Users update own credentials"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'credenciales'
  AND (storage.foldername(name))[1] = 'descuentos'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'credenciales'
  AND (storage.foldername(name))[1] = 'descuentos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
CREATE POLICY "Users delete own credentials"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'credenciales'
  AND (storage.foldername(name))[1] = 'descuentos'
  AND ((storage.foldername(name))[2] = auth.uid()::text OR public.is_admin())
);

-- 4) VOTOS
DROP POLICY IF EXISTS "Creadores pueden ver votos de sus votaciones" ON public.votos;
DROP VIEW IF EXISTS public.votos_creador CASCADE;
CREATE VIEW public.votos_creador
WITH (security_invoker = true) AS
SELECT id, votacion_id, opcion_id, user_id, fecha_voto, observacion
FROM public.votos
WHERE public.is_votacion_creator(auth.uid(), votacion_id);
GRANT SELECT ON public.votos_creador TO authenticated;

-- 5) GPS TRACKERS
DROP POLICY IF EXISTS "Service role can update trackers" ON public.gps_trackers;
CREATE POLICY "Service role can update trackers"
ON public.gps_trackers FOR UPDATE TO service_role
USING (true) WITH CHECK (true);

-- 6) LISTING COMMENTS
DROP POLICY IF EXISTS "Cualquiera puede ver comentarios de listings" ON public.listing_comments;
CREATE POLICY "Authenticated can view listing comments"
ON public.listing_comments FOR SELECT TO authenticated USING (true);

DROP VIEW IF EXISTS public.listing_comments_publico CASCADE;
CREATE VIEW public.listing_comments_publico
WITH (security_invoker = true) AS
SELECT id, listing_id, message, created_at
FROM public.listing_comments;
GRANT SELECT ON public.listing_comments_publico TO anon, authenticated;
