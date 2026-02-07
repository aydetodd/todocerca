
-- Allow active drivers to view units from their associated provider
CREATE POLICY "Choferes can view units from their provider"
ON public.unidades_empresa
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM choferes_empresa ce
    WHERE ce.proveedor_id = unidades_empresa.proveedor_id
    AND ce.user_id = auth.uid()
    AND ce.is_active = true
  )
);
