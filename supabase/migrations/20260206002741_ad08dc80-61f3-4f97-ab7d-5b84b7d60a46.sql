
-- Drop old permissive policies that override our new privacy controls
-- These old policies have qual=true which makes ALL products visible to everyone,
-- defeating the purpose of the new private route visibility controls

DROP POLICY IF EXISTS "Anyone can view productos" ON public.productos;
DROP POLICY IF EXISTS "Everyone can view productos" ON public.productos;

-- Also drop duplicate write policies (productos_owner_write covers these)
DROP POLICY IF EXISTS "Proveedores can manage own products" ON public.productos;
