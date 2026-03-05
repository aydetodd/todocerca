CREATE POLICY "Choferes ven sus propios logs"
ON public.logs_validacion_qr
FOR SELECT
TO authenticated
USING (chofer_id = auth.uid());