-- Permitir a proveedores eliminar sus propios pedidos
CREATE POLICY "Proveedores pueden eliminar sus pedidos"
ON public.pedidos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM proveedores
    WHERE proveedores.id = pedidos.proveedor_id
    AND proveedores.user_id = auth.uid()
  )
);