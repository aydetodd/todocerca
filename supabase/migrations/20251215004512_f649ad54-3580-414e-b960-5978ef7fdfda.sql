-- Habilitar REPLICA IDENTITY FULL para profiles (necesario para realtime)
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- Agregar profiles a la publicación de realtime si no está
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;