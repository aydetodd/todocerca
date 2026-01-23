-- Enable realtime events for taxi requests (required for sound + instant UI updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'taxi_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_requests;
  END IF;
END $$;