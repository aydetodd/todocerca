ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cuenta_bloqueada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueada_en timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueada_motivo text;

CREATE TABLE IF NOT EXISTS public.rescate_intentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  telefono text,
  accion text NOT NULL,
  resultado text NOT NULL,
  ip text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rescate_intentos TO authenticated;
GRANT ALL ON public.rescate_intentos TO service_role;
ALTER TABLE public.rescate_intentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo lectura propia" ON public.rescate_intentos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.active_sessions
  ADD COLUMN IF NOT EXISTS es_rescate boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cuenta_esta_bloqueada(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT cuenta_bloqueada FROM public.profiles WHERE user_id = _user_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.cuenta_esta_bloqueada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cuenta_esta_bloqueada(uuid) TO service_role;