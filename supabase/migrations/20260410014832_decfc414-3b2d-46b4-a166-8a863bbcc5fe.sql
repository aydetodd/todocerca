CREATE OR REPLACE FUNCTION public.is_concesionario_for_empresa(p_empresa_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_transporte ct
    JOIN public.proveedores p ON p.id = ct.concesionario_id
    WHERE ct.empresa_id = p_empresa_id
      AND p.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_concesionario_for_empresa(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_concesionario_for_empresa(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Empresa admin gestiona su empresa" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Empresa admin puede ver su empresa" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Empresa admin puede insertar su empresa" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Empresa admin puede actualizar su empresa" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Empresa admin puede eliminar su empresa" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Concesionarios ven empresas con contrato" ON public.empresas_transporte;
DROP POLICY IF EXISTS "Admins gestionan todas las empresas" ON public.empresas_transporte;

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
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Empresa admin puede eliminar su empresa"
ON public.empresas_transporte
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Concesionarios ven empresas con contrato"
ON public.empresas_transporte
FOR SELECT
USING (public.is_concesionario_for_empresa(id, auth.uid()));

CREATE POLICY "Admins gestionan todas las empresas"
ON public.empresas_transporte
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());