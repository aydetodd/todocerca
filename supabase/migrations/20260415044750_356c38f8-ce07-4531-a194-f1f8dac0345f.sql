
-- Add transport_type column to choferes_empresa
ALTER TABLE public.choferes_empresa 
ADD COLUMN transport_type text NOT NULL DEFAULT 'publico';

-- Add check constraint matching the allowed values
ALTER TABLE public.choferes_empresa 
ADD CONSTRAINT choferes_empresa_transport_type_check 
CHECK (transport_type IN ('publico', 'foraneo', 'privado', 'taxi'));

-- Drop the existing unique constraint on (proveedor_id, telefono) and replace with one that includes transport_type
-- so the same driver phone can be registered in both public and private
ALTER TABLE public.choferes_empresa DROP CONSTRAINT IF EXISTS choferes_empresa_proveedor_id_telefono_key;
ALTER TABLE public.choferes_empresa ADD CONSTRAINT choferes_empresa_proveedor_telefono_type_key UNIQUE (proveedor_id, telefono, transport_type);

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_choferes_empresa_transport_type ON public.choferes_empresa(proveedor_id, transport_type);
