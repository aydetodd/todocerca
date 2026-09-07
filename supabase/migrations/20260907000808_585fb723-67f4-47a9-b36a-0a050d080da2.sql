
REVOKE EXECUTE ON FUNCTION public.qard_cobrar_comision(uuid, public.commission_type, numeric, numeric, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qard_comision_retiro(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.master_qard_no_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_cobrar_comision(uuid, public.commission_type, numeric, numeric, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.qard_comision_retiro(uuid, numeric, text) TO service_role;
