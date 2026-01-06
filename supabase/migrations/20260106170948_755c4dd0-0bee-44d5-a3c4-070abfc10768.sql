-- Asegurar que la tabla citas tenga REPLICA IDENTITY FULL para realtime
ALTER TABLE public.citas REPLICA IDENTITY FULL;

-- Agregar la tabla citas a la publicación de realtime si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'citas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas;
  END IF;
END $$;