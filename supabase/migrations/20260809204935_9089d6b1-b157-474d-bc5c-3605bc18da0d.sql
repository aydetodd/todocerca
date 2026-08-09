ALTER TABLE public.qard_movimientos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_movimientos;