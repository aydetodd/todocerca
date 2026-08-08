REVOKE EXECUTE ON FUNCTION public.qard_rate_limit_check(uuid, text, int, int) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.qard_rate_limit_purge() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.qard_rate_limit_check(uuid, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.qard_rate_limit_purge() TO service_role;