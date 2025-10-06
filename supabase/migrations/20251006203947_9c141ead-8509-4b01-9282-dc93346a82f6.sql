-- Drop existing policies that might be conflicting
DROP POLICY IF EXISTS "Users can insert their own location" ON public.proveedor_locations;
DROP POLICY IF EXISTS "Users can update their own location" ON public.proveedor_locations;
DROP POLICY IF EXISTS "Users can delete their own location" ON public.proveedor_locations;

-- Create new policies with proper permissions for upsert operations
CREATE POLICY "Users can manage their own location"
ON public.proveedor_locations
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Keep the existing SELECT policy
-- "Everyone can view proveedor_locations" already exists