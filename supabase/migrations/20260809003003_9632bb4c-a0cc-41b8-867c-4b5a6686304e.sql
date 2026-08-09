
CREATE POLICY "constancias_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'constancias-fiscales' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "constancias_select_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'constancias-fiscales' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "constancias_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'constancias-fiscales' AND (storage.foldername(name))[1] = auth.uid()::text);
