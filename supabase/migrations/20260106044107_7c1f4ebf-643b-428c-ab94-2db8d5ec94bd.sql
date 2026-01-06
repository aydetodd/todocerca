-- Habilitar REPLICA IDENTITY FULL para que los cambios se transmitan en tiempo real
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.tracking_member_locations REPLICA IDENTITY FULL;

-- Asegurar que las tablas estén en la publicación de realtime
DO $$
BEGIN
  -- Agregar profiles a supabase_realtime si no está
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  
  -- Agregar tracking_member_locations a supabase_realtime si no está
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tracking_member_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_member_locations;
  END IF;
END $$;