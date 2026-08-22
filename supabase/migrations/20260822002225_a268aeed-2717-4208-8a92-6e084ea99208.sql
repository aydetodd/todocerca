
REVOKE EXECUTE ON FUNCTION public.ev_is_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ev_is_validador(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ev_is_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ev_is_validador(uuid) TO authenticated;
