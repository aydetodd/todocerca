
DROP POLICY IF EXISTS "Admins gestionan verificaciones descuento" ON verificaciones_descuento;

CREATE POLICY "Admin maestro gestiona verificaciones descuento" ON verificaciones_descuento
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND consecutive_number = 1
    )
  );
