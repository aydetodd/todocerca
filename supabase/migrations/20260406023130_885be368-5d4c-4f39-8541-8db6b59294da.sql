-- Allow concesionarios to see fraud attempts on their units
CREATE POLICY "Concesionarios ven fraudes de sus unidades"
ON public.intentos_fraude
FOR SELECT
TO authenticated
USING (
  unidad_detecto_id IN (
    SELECT ue.id FROM unidades_empresa ue
    JOIN proveedores p ON p.id = ue.proveedor_id
    WHERE p.user_id = auth.uid()
  )
  OR
  unidad_uso_original_id IN (
    SELECT ue.id FROM unidades_empresa ue
    JOIN proveedores p ON p.id = ue.proveedor_id
    WHERE p.user_id = auth.uid()
  )
);