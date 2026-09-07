DROP POLICY IF EXISTS "ine_docs_admin_read" ON storage.objects;
CREATE POLICY "ine_docs_admin_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ine-documentos' AND public.is_admin());