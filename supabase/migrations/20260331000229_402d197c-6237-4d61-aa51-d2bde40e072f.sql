-- Permitir que cada concesionario actualice su propia cuenta conectada
CREATE POLICY "Concesionarios actualizan su cuenta conectada"
ON public.cuentas_conectadas
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.id = cuentas_conectadas.concesionario_id
      AND p.user_id = auth.uid()
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.id = cuentas_conectadas.concesionario_id
      AND p.user_id = auth.uid()
  )
  OR public.is_admin()
);