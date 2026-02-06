
-- Create security definer functions to break RLS recursion between productos and ruta_invitaciones

-- Function to check if user is owner of a product (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_product_owner(p_producto_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM productos prod
    JOIN proveedores prov ON prov.id = prod.proveedor_id
    WHERE prod.id = p_producto_id
    AND prov.user_id = p_user_id
  );
$$;

-- Function to check if user is invited to a private product (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_invited_to_product(p_producto_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ruta_invitaciones ri
    JOIN profiles p ON normalize_phone(p.telefono) = normalize_phone(ri.telefono_invitado)
    WHERE ri.producto_id = p_producto_id
    AND p.user_id = p_user_id
  );
$$;

-- Function to check if user owns products via proveedores (bypasses RLS on productos)
CREATE OR REPLACE FUNCTION public.is_proveedor_owner(p_proveedor_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM proveedores prov
    WHERE prov.id = p_proveedor_id
    AND prov.user_id = p_user_id
  );
$$;

-- Now fix the productos policies to use security definer functions
DROP POLICY IF EXISTS "productos_invited_read" ON public.productos;
CREATE POLICY "productos_invited_read" ON public.productos
FOR SELECT USING (
  is_private = TRUE 
  AND public.is_invited_to_product(id, auth.uid())
);

DROP POLICY IF EXISTS "productos_owner_read" ON public.productos;
CREATE POLICY "productos_owner_read" ON public.productos
FOR SELECT USING (
  public.is_proveedor_owner(proveedor_id, auth.uid())
);

DROP POLICY IF EXISTS "productos_owner_write" ON public.productos;
CREATE POLICY "productos_owner_write" ON public.productos
FOR ALL USING (
  public.is_proveedor_owner(proveedor_id, auth.uid())
);

-- Fix ruta_invitaciones policies to use security definer functions
DROP POLICY IF EXISTS "Proveedores pueden ver sus invitaciones" ON public.ruta_invitaciones;
CREATE POLICY "Proveedores pueden ver sus invitaciones" ON public.ruta_invitaciones
FOR SELECT USING (
  public.is_product_owner(producto_id, auth.uid())
);

DROP POLICY IF EXISTS "Proveedores pueden eliminar invitaciones" ON public.ruta_invitaciones;
CREATE POLICY "Proveedores pueden eliminar invitaciones" ON public.ruta_invitaciones
FOR DELETE USING (
  public.is_product_owner(producto_id, auth.uid())
);
