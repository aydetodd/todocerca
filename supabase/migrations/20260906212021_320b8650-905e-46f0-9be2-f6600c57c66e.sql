ALTER TABLE public.qard_identidad
  ADD COLUMN IF NOT EXISTS verification_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_limit_udis integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verificamex_status text,
  ADD COLUMN IF NOT EXISTS verificamex_data_enc text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.verificamex_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  exito boolean NOT NULL DEFAULT false,
  http_status integer,
  mensaje text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.verificamex_logs TO authenticated;
GRANT ALL ON public.verificamex_logs TO service_role;

ALTER TABLE public.verificamex_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su bitacora de verificacion"
ON public.verificamex_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_verificamex_logs_user ON public.verificamex_logs(user_id, created_at DESC);