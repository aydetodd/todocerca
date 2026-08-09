
-- ============ IDENTIDAD DUAL QaRd ============
CREATE TABLE IF NOT EXISTS public.qard_identidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'inactive',
  nombre_completo text,
  curp_enc text,
  phone_verified boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  moral_estado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qard_identidad_estado_chk CHECK (estado IN ('inactive','active','moral_review','moral_approved'))
);

GRANT SELECT, INSERT, UPDATE ON public.qard_identidad TO authenticated;
GRANT ALL ON public.qard_identidad TO service_role;
ALTER TABLE public.qard_identidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qard_identidad_select_own" ON public.qard_identidad
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "qard_identidad_insert_own" ON public.qard_identidad
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "qard_identidad_update_admin" ON public.qard_identidad
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER trg_qard_identidad_touch BEFORE UPDATE ON public.qard_identidad
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ SOLICITUDES PERSONA MORAL ============
CREATE TABLE IF NOT EXISTS public.qard_moral_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  razon_social text NOT NULL,
  rfc text NOT NULL,
  constancia_path text NOT NULL,
  estado text NOT NULL DEFAULT 'pending',
  motivo_rechazo text,
  revisado_por uuid,
  revisado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qard_moral_estado_chk CHECK (estado IN ('pending','approved','rejected'))
);

GRANT SELECT, INSERT ON public.qard_moral_solicitudes TO authenticated;
GRANT UPDATE ON public.qard_moral_solicitudes TO authenticated;
GRANT ALL ON public.qard_moral_solicitudes TO service_role;
ALTER TABLE public.qard_moral_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "moral_select_own_or_admin" ON public.qard_moral_solicitudes
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "moral_insert_own" ON public.qard_moral_solicitudes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "moral_update_admin" ON public.qard_moral_solicitudes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER trg_qard_moral_touch BEFORE UPDATE ON public.qard_moral_solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_moral_estado ON public.qard_moral_solicitudes(estado, created_at DESC);

-- ============ TOKENS DE CORREO (7 días) ============
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_verification_tokens TO authenticated;
GRANT ALL ON public.email_verification_tokens TO service_role;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_tokens_select_own" ON public.email_verification_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ BACKFILL ============
INSERT INTO public.qard_identidad (user_id, estado)
SELECT p.user_id, 'inactive'
FROM public.profiles p
WHERE p.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Alta automática para nuevos perfiles
CREATE OR REPLACE FUNCTION public.tg_qard_identidad_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.qard_identidad (user_id, estado)
  VALUES (NEW.user_id, 'inactive')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qard_identidad_on_profile ON public.profiles;
CREATE TRIGGER trg_qard_identidad_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_qard_identidad_on_profile();

-- ============ LÍMITE MENSUAL DE RECARGA ============
CREATE OR REPLACE FUNCTION public.qard_recargas_mes(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(m.monto_mxn), 0)::numeric
  FROM public.qard_movimientos m
  WHERE m.titular_user_id = _user_id
    AND m.tipo = 'recarga'
    AND (m.created_at AT TIME ZONE 'America/Hermosillo')
        >= date_trunc('month', (now() AT TIME ZONE 'America/Hermosillo'));
$$;

CREATE OR REPLACE FUNCTION public.qard_limite_recarga(_user_id uuid)
RETURNS TABLE(estado text, tope numeric, usado numeric, disponible numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _estado text;
  _tope numeric;
  _usado numeric;
BEGIN
  SELECT i.estado INTO _estado FROM public.qard_identidad i WHERE i.user_id = _user_id;
  _estado := COALESCE(_estado, 'inactive');
  _tope := CASE WHEN _estado = 'moral_approved' THEN NULL ELSE 10000 END;
  _usado := public.qard_recargas_mes(_user_id);
  RETURN QUERY SELECT _estado, _tope, _usado,
    CASE WHEN _tope IS NULL THEN NULL ELSE GREATEST(_tope - _usado, 0) END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_recargas_mes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qard_limite_recarga(uuid) TO authenticated, service_role;

-- ============ NOMBRE LEGAL (solo contextos financieros) ============
CREATE OR REPLACE FUNCTION public.qard_nombre_legal(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(i.nombre_completo, p.apodo, p.nombre)
  FROM public.profiles p
  LEFT JOIN public.qard_identidad i ON i.user_id = p.user_id
  WHERE p.user_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.qard_nombre_legal(uuid) TO authenticated, service_role;

-- ============ MI IDENTIDAD (con CURP descifrada al dueño) ============
CREATE OR REPLACE FUNCTION public.qard_mi_identidad()
RETURNS TABLE(estado text, nombre_completo text, curp text, phone_verified boolean, email_verified boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.estado, i.nombre_completo,
         CASE WHEN i.curp_enc IS NULL THEN NULL ELSE public.qard_dec(i.curp_enc) END,
         i.phone_verified, i.email_verified
  FROM public.qard_identidad i
  WHERE i.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_mi_identidad() TO authenticated;
