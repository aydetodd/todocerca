-- Drop the problematic ALL policy
DROP POLICY IF EXISTS "Empresa admin gestiona su empresa" ON public.empresas_transporte;

-- Create separate policies to avoid recursion
CREATE POLICY "Empresa admin puede ver su empresa"
ON public.empresas_transporte
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Empresa admin puede insertar su empresa"
ON public.empresas_transporte
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Empresa admin puede actualizar su empresa"
ON public.empresas_transporte
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Empresa admin puede eliminar su empresa"
ON public.empresas_transporte
FOR DELETE
USING (auth.uid() = user_id);