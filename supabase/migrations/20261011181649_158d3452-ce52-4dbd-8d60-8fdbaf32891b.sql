REVOKE EXECUTE ON FUNCTION public.fletes_tiene_acceso(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_fletes_anuncio_before() FROM PUBLIC, anon, authenticated;