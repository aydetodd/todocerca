-- 1. Bucket privado para documentos de verificación
INSERT INTO storage.buckets (id, name, public)
VALUES ('verificacion-docs', 'verificacion-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Columnas extra en verificaciones_concesionario
ALTER TABLE public.verificaciones_concesionario
  ADD COLUMN IF NOT EXISTS documentos JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metodo_envio TEXT DEFAULT 'whatsapp';

-- 3. RLS storage.objects para verificacion-docs
-- Carpeta = proveedor_id (UUID). Path: <proveedor_id>/<doc_type>.<ext>

-- Concesionario sube/lee/borra solo SUS docs
DROP POLICY IF EXISTS "Concesionario gestiona sus docs verificacion" ON storage.objects;
CREATE POLICY "Concesionario gestiona sus docs verificacion"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'verificacion-docs'
  AND EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.user_id = auth.uid()
      AND p.id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'verificacion-docs'
  AND EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.user_id = auth.uid()
      AND p.id::text = (storage.foldername(name))[1]
  )
);

-- Admin maestro (consecutive_number = 1) puede ver/borrar todos
DROP POLICY IF EXISTS "Admin maestro lee todos los docs verificacion" ON storage.objects;
CREATE POLICY "Admin maestro lee todos los docs verificacion"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'verificacion-docs'
  AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.user_id = auth.uid()
      AND pr.consecutive_number = 1
  )
)
WITH CHECK (
  bucket_id = 'verificacion-docs'
  AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.user_id = auth.uid()
      AND pr.consecutive_number = 1
  )
);