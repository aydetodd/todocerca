-- Habilitar realtime para proveedor_locations
-- Esto asegura que las actualizaciones se transmitan en tiempo real

-- 1. Asegurar que la tabla tenga REPLICA IDENTITY FULL
ALTER TABLE proveedor_locations REPLICA IDENTITY FULL;

-- 2. Agregar la tabla a la publicación de realtime si no está
DO $$
BEGIN
  -- Verificar si la tabla ya está en la publicación
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'proveedor_locations'
  ) THEN
    -- Agregar la tabla a la publicación
    ALTER PUBLICATION supabase_realtime ADD TABLE proveedor_locations;
  END IF;
END $$;