-- Add invite_token column to productos for shareable private route links
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS invite_token uuid DEFAULT gen_random_uuid();

-- Create unique index on invite_token for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_invite_token 
ON public.productos(invite_token) 
WHERE invite_token IS NOT NULL;

-- Update existing ruta_invitaciones to track if accepted
ALTER TABLE public.ruta_invitaciones
ADD COLUMN IF NOT EXISTS is_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Drop existing RLS policies on productos if they reference is_private incorrectly
-- Then recreate proper policies

-- Policy: Everyone can see non-private products
DROP POLICY IF EXISTS "productos_public_read" ON public.productos;
CREATE POLICY "productos_public_read" ON public.productos
FOR SELECT USING (
  is_private IS NOT TRUE
);

-- Policy: Invited users can see private products
DROP POLICY IF EXISTS "productos_invited_read" ON public.productos;
CREATE POLICY "productos_invited_read" ON public.productos
FOR SELECT USING (
  is_private = TRUE 
  AND EXISTS (
    SELECT 1 FROM ruta_invitaciones ri
    JOIN profiles p ON normalize_phone(p.telefono) = normalize_phone(ri.telefono_invitado)
    WHERE ri.producto_id = productos.id
    AND p.user_id = auth.uid()
  )
);

-- Policy: Owners can always see their own products
DROP POLICY IF EXISTS "productos_owner_read" ON public.productos;
CREATE POLICY "productos_owner_read" ON public.productos
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM proveedores prov
    WHERE prov.id = productos.proveedor_id
    AND prov.user_id = auth.uid()
  )
);

-- Policy: Owners can insert/update/delete their products
DROP POLICY IF EXISTS "productos_owner_write" ON public.productos;
CREATE POLICY "productos_owner_write" ON public.productos
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM proveedores prov
    WHERE prov.id = productos.proveedor_id
    AND prov.user_id = auth.uid()
  )
);

-- Enable RLS on productos if not already enabled
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;