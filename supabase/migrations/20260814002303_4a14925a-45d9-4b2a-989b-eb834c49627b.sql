CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.admin_pin (
  user_id UUID PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_pin TO service_role;
ALTER TABLE public.admin_pin ENABLE ROW LEVEL SECURITY;

-- Sin políticas: el acceso ocurre únicamente por funciones SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.admin_pin_estado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_pin WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_set(_pin TEXT, _pin_actual TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existente TEXT;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND consecutive_number = 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador puede poner un PIN');
  END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El PIN debe tener 6 dígitos');
  END IF;

  SELECT pin_hash INTO _existente FROM public.admin_pin WHERE user_id = _uid;
  IF _existente IS NOT NULL THEN
    IF _pin_actual IS NULL OR extensions.crypt(_pin_actual, _existente) <> _existente THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El PIN actual no coincide');
    END IF;
  END IF;

  INSERT INTO public.admin_pin (user_id, pin_hash, intentos_fallidos, bloqueado_hasta, updated_at)
  VALUES (_uid, extensions.crypt(_pin, extensions.gen_salt('bf', 10)), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, intentos_fallidos = 0, bloqueado_hasta = NULL, updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_verify(_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.admin_pin%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO _row FROM public.admin_pin WHERE user_id = _uid;
  IF _row.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay PIN configurado');
  END IF;

  IF _row.bloqueado_hasta IS NOT NULL AND _row.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera unos minutos.', 'bloqueado_hasta', _row.bloqueado_hasta);
  END IF;

  IF extensions.crypt(_pin, _row.pin_hash) = _row.pin_hash THEN
    UPDATE public.admin_pin SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.admin_pin
    SET intentos_fallidos = _row.intentos_fallidos + 1,
        bloqueado_hasta = CASE WHEN _row.intentos_fallidos + 1 >= 5 THEN now() + interval '10 minutes' ELSE NULL END
  WHERE user_id = _uid;

  RETURN jsonb_build_object('ok', false, 'error', 'PIN incorrecto', 'intentos', _row.intentos_fallidos + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pin_set(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_pin_verify(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_pin_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pin_set(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_verify(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_estado() TO authenticated;