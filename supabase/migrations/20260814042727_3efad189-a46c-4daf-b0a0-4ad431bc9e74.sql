ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trazabilidad_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clave_universal_migrada boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.trazabilidad_puntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sub_qr_id uuid REFERENCES public.qard_sub_qr(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  tipo_evento text NOT NULL DEFAULT 'escaneo',
  receptor_id text,
  receptor_nombre text,
  lugar text,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.trazabilidad_puntos TO authenticated;
GRANT ALL ON public.trazabilidad_puntos TO service_role;

ALTER TABLE public.trazabilidad_puntos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_traza_select" ON public.trazabilidad_puntos;
CREATE POLICY "own_traza_select" ON public.trazabilidad_puntos
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_traza_insert" ON public.trazabilidad_puntos;
CREATE POLICY "own_traza_insert" ON public.trazabilidad_puntos
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_traza_delete" ON public.trazabilidad_puntos;
CREATE POLICY "own_traza_delete" ON public.trazabilidad_puntos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_traza_user_fecha ON public.trazabilidad_puntos(user_id, ocurrido_en DESC);

CREATE OR REPLACE FUNCTION public.rpc_registrar_punto_traza(
  _target_qard text,
  _lat double precision,
  _lng double precision,
  _tipo text DEFAULT 'testigo',
  _lugar text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_sub uuid;
  v_activa boolean;
  v_nombre text;
  v_receptor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT user_id INTO v_user FROM public.profiles WHERE qard_number = _target_qard LIMIT 1;

  IF v_user IS NULL THEN
    SELECT s.titular_user_id, s.id INTO v_user, v_sub
    FROM public.qard_sub_qr s WHERE s.qard_number = _target_qard LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No encontré esa tarjeta QaRd');
  END IF;

  SELECT p.trazabilidad_activa, p.nombre INTO v_activa, v_nombre
  FROM public.profiles p WHERE p.user_id = v_user;

  IF COALESCE(v_activa, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa persona tiene la trazabilidad desactivada');
  END IF;

  SELECT nombre INTO v_receptor FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.trazabilidad_puntos (user_id, sub_qr_id, lat, lng, tipo_evento, receptor_id, receptor_nombre, lugar)
  VALUES (v_user, v_sub, _lat, _lng, COALESCE(_tipo, 'testigo'), auth.uid()::text, v_receptor, _lugar);

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_registrar_punto_traza(text, double precision, double precision, text, text) TO authenticated;