
-- Add estado and iniciado_por columns to contratos_transporte
ALTER TABLE public.contratos_transporte 
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS iniciado_por text NOT NULL DEFAULT 'concesionario';

-- Update existing active contracts to 'aceptado'
UPDATE public.contratos_transporte SET estado = 'aceptado' WHERE is_active = true;
UPDATE public.contratos_transporte SET estado = 'rechazado' WHERE is_active = false;

-- Allow concesionarios to INSERT contracts (propose)
CREATE POLICY "Concesionario puede crear contratos"
ON public.contratos_transporte
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM proveedores p
    WHERE p.id = contratos_transporte.concesionario_id
    AND p.user_id = auth.uid()
  )
);

-- Allow concesionarios to UPDATE contracts (accept proposals from empresas)
CREATE POLICY "Concesionario puede actualizar sus contratos"
ON public.contratos_transporte
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM proveedores p
    WHERE p.id = contratos_transporte.concesionario_id
    AND p.user_id = auth.uid()
  )
);

-- Allow authenticated users to search empresas by name (read-only for search)
CREATE POLICY "Usuarios autenticados pueden buscar empresas"
ON public.empresas_transporte
FOR SELECT
TO authenticated
USING (is_active = true);

-- Allow authenticated users to search proveedores by name (read-only for contract proposals)
-- proveedores table likely already has a public read policy, but let's ensure empresas can find concesionarios
