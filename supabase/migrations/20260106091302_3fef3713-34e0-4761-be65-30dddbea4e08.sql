-- Eliminar la política problemática que solo permite 'authenticated' role
DROP POLICY IF EXISTS "Users can manage their own location" ON proveedor_locations;

-- Crear nueva política que usa auth.uid() correctamente para el rol anon también
CREATE POLICY "Users can manage their own location"
ON proveedor_locations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);