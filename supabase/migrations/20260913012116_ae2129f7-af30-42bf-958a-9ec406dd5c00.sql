CREATE TABLE public.ine_validaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ine_nombre_extraido text,
  ine_curp_extraido text,
  ine_numero_credencial text,
  ine_fecha_nacimiento text,
  ine_fecha_extraccion timestamptz NOT NULL DEFAULT now(),
  curp_renapo text,
  nombre_renapo text,
  coincidencia boolean NOT NULL DEFAULT false,
  ine_confirmed boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'pendiente',
  raw_response_enc text,
  ine_front_image_url text,
  ine_back_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ine_validaciones TO authenticated;
GRANT ALL ON public.ine_validaciones TO service_role;

ALTER TABLE public.ine_validaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dueño ve sus validaciones de INE"
ON public.ine_validaciones FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admin ve todas las validaciones de INE"
ON public.ine_validaciones FOR SELECT TO authenticated
USING (public.is_admin());

CREATE INDEX idx_ine_validaciones_user ON public.ine_validaciones(user_id, created_at DESC);
CREATE INDEX idx_ine_validaciones_estado ON public.ine_validaciones(estado);

CREATE TRIGGER trg_ine_validaciones_updated_at
BEFORE UPDATE ON public.ine_validaciones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.verificamex_logs
  ADD COLUMN IF NOT EXISTS datos_extraidos jsonb,
  ADD COLUMN IF NOT EXISTS coincidencia boolean,
  ADD COLUMN IF NOT EXISTS accion_tomada text;