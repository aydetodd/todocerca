-- Asegurar realtime completo en tablas críticas para sincronización instantánea
ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
ALTER TABLE public.taxi_requests REPLICA IDENTITY FULL;
ALTER TABLE public.sos_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.listings REPLICA IDENTITY FULL;
ALTER TABLE public.favoritos REPLICA IDENTITY FULL;
ALTER TABLE public.asignaciones_chofer REPLICA IDENTITY FULL;

-- Agregar asignaciones_chofer a la publicación realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='asignaciones_chofer'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.asignaciones_chofer;
  END IF;
END $$;