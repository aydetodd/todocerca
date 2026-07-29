CREATE OR REPLACE FUNCTION public.qard_purge_movimientos_antiguos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.qard_movimientos
  WHERE created_at < (now() - interval '2 months');
$$;

SELECT cron.schedule(
  'qard-purge-movimientos',
  '15 9 * * *',
  $$SELECT public.qard_purge_movimientos_antiguos();$$
);