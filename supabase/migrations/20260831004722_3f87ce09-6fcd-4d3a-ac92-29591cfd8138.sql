GRANT EXECUTE ON FUNCTION public.qard_enc(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qard_enc(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.qard_dec(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qard_dec(text) TO service_role;