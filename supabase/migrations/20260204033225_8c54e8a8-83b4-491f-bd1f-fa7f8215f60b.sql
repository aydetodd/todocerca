-- Add columns for private routes
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS route_type text DEFAULT 'urbana';

-- Create table for private route invitations
CREATE TABLE IF NOT EXISTS public.ruta_invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  telefono_invitado text NOT NULL,
  is_accepted boolean DEFAULT false,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(producto_id, telefono_invitado)
);

-- Enable RLS
ALTER TABLE public.ruta_invitaciones ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can manage their own route invitations
CREATE POLICY "Proveedores pueden ver sus invitaciones" 
ON public.ruta_invitaciones 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.productos p 
    JOIN public.proveedores prov ON p.proveedor_id = prov.id
    WHERE p.id = producto_id 
    AND prov.user_id = auth.uid()
  )
);

CREATE POLICY "Proveedores pueden crear invitaciones" 
ON public.ruta_invitaciones 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.productos p 
    JOIN public.proveedores prov ON p.proveedor_id = prov.id
    WHERE p.id = producto_id 
    AND prov.user_id = auth.uid()
  )
);

CREATE POLICY "Proveedores pueden eliminar invitaciones" 
ON public.ruta_invitaciones 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.productos p 
    JOIN public.proveedores prov ON p.proveedor_id = prov.id
    WHERE p.id = producto_id 
    AND prov.user_id = auth.uid()
  )
);

-- Policy: Invited users can see routes they're invited to
CREATE POLICY "Invitados pueden ver sus invitaciones" 
ON public.ruta_invitaciones 
FOR SELECT 
USING (
  telefono_invitado IN (
    SELECT phone FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ruta_invitaciones_producto ON public.ruta_invitaciones(producto_id);
CREATE INDEX IF NOT EXISTS idx_ruta_invitaciones_telefono ON public.ruta_invitaciones(telefono_invitado);
CREATE INDEX IF NOT EXISTS idx_productos_route_type ON public.productos(route_type) WHERE route_type IS NOT NULL;