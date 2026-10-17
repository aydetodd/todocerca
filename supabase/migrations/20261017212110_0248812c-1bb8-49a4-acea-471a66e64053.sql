REVOKE UPDATE ON public.fletes_proveedores FROM authenticated,anon;
REVOKE UPDATE (user_id,nombre_negocio,rfc,rfc_verificado,verificado_at,created_at,updated_at) ON public.fletes_proveedores FROM authenticated,anon;
GRANT UPDATE (tipo) ON public.fletes_proveedores TO authenticated;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fletes_proveedores') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fletes_proveedores; END IF; END $$;