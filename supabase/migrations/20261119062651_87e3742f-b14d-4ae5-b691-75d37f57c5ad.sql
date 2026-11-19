REVOKE ALL ON TABLE public.qard_bolsillos FROM PUBLIC,anon,authenticated;
REVOKE SELECT(saldo_mxn) ON public.qard_bolsillos FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,titular_user_id,concepto,created_at,updated_at) ON public.qard_bolsillos TO authenticated;
GRANT ALL ON public.qard_bolsillos TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA qard_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SCHEMA qard_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA qard_private TO authenticated;
