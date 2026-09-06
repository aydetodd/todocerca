GRANT SELECT ON public.stp_depositos TO authenticated;
GRANT ALL ON public.stp_depositos TO service_role;
GRANT SELECT ON public.stp_config TO authenticated;
GRANT ALL ON public.stp_config TO service_role;
GRANT ALL ON public.stp_webhook_log TO service_role;