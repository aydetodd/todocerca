-- Insertar categoría "Cosas Regaladas" si no existe
INSERT INTO public.categories (name, icon, is_product, parent_id)
SELECT 'Cosas Regaladas', '🎁', true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'Cosas Regaladas'
);

-- Actualizar políticas RLS de listings para permitir a cualquier usuario autenticado crear listings gratuitos
DROP POLICY IF EXISTS "Users can manage own listings" ON public.listings;

-- Política para que usuarios puedan ver sus propios listings
CREATE POLICY "Users can view their own listings"
ON public.listings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = listings.profile_id
    AND profiles.user_id = auth.uid()
  )
);

-- Política para que usuarios puedan crear listings (sin restricción de proveedor)
CREATE POLICY "Authenticated users can create listings"
ON public.listings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = listings.profile_id
    AND profiles.user_id = auth.uid()
  )
);

-- Política para que usuarios puedan actualizar sus propios listings
CREATE POLICY "Users can update their own listings"
ON public.listings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = listings.profile_id
    AND profiles.user_id = auth.uid()
  )
);

-- Política para que usuarios puedan eliminar sus propios listings
CREATE POLICY "Users can delete their own listings"
ON public.listings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = listings.profile_id
    AND profiles.user_id = auth.uid()
  )
);

-- Habilitar realtime para listings
ALTER PUBLICATION supabase_realtime ADD TABLE listings;