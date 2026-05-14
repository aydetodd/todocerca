GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

COMMENT ON FUNCTION public.is_admin() IS 'Checks master admin by consecutive_number = 1. Anonymous callers can execute and receive false, so public RLS policies that include admin branches do not fail with permission denied.';