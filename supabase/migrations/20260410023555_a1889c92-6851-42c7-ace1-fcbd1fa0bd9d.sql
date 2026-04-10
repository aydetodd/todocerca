
-- Add invite_token column to empleados_empresa
ALTER TABLE public.empleados_empresa
ADD COLUMN invite_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Add unique index
CREATE UNIQUE INDEX idx_empleados_empresa_invite_token ON public.empleados_empresa(invite_token);
