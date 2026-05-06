CREATE POLICY "Concesionario ve viajes de sus choferes"
ON public.viajes_realizados
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.choferes_empresa ce
    JOIN public.proveedores p ON p.id = ce.proveedor_id
    WHERE ce.id = viajes_realizados.chofer_id
      AND p.user_id = auth.uid()
  )
);