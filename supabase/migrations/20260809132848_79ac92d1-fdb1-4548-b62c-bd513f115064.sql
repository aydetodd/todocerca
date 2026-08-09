CREATE TABLE IF NOT EXISTS public.app_cron_secret (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.app_cron_secret FROM anon, authenticated;
GRANT ALL ON public.app_cron_secret TO service_role;

ALTER TABLE public.app_cron_secret ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to cron secret"
  ON public.app_cron_secret FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

INSERT INTO public.app_cron_secret (id, secret)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;