
-- Catálogos INEGI México y ladas para calcular el número QaRd de 16 dígitos
CREATE TABLE IF NOT EXISTS public.mx_inegi_estados (
  cve_estado text PRIMARY KEY CHECK (length(cve_estado) = 2),
  nombre text NOT NULL,
  clave text
);
GRANT SELECT ON public.mx_inegi_estados TO anon, authenticated;
GRANT ALL ON public.mx_inegi_estados TO service_role;
ALTER TABLE public.mx_inegi_estados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estados_read_all" ON public.mx_inegi_estados FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.mx_inegi_municipios (
  cve_estado text NOT NULL CHECK (length(cve_estado)=2),
  cve_municipio text NOT NULL CHECK (length(cve_municipio)=3),
  nombre text NOT NULL,
  PRIMARY KEY (cve_estado, cve_municipio)
);
GRANT SELECT ON public.mx_inegi_municipios TO anon, authenticated;
GRANT ALL ON public.mx_inegi_municipios TO service_role;
ALTER TABLE public.mx_inegi_municipios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "muni_read_all" ON public.mx_inegi_municipios FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.mx_ladas (
  lada text PRIMARY KEY CHECK (length(lada) BETWEEN 2 AND 3),
  cve_estado text NOT NULL CHECK (length(cve_estado)=2),
  cve_municipio text NOT NULL DEFAULT '000' CHECK (length(cve_municipio)=3),
  descripcion text
);
GRANT SELECT ON public.mx_ladas TO anon, authenticated;
GRANT ALL ON public.mx_ladas TO service_role;
ALTER TABLE public.mx_ladas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ladas_read_all" ON public.mx_ladas FOR SELECT USING (true);

-- Nueva función: extrae PP/EE/MMM a partir del teléfono del usuario
CREATE OR REPLACE FUNCTION public.qard_bucket_for_user(_user_id uuid)
RETURNS TABLE(pp text, ee text, mmm text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tel text;
  v_digits text;
  v_pp text := '00';
  v_ee text := '00';
  v_mmm text := '000';
  v_local text;
  v_l3 text;
  v_l2 text;
  v_hit record;
BEGIN
  SELECT telefono INTO v_tel FROM profiles WHERE user_id = _user_id LIMIT 1;

  IF v_tel IS NULL OR btrim(v_tel) = '' THEN
    RETURN QUERY SELECT v_pp, v_ee, v_mmm;
    RETURN;
  END IF;

  v_digits := regexp_replace(v_tel, '[^0-9]', '', 'g');

  -- Determinar PP (país) desde la tabla paises
  SELECT SUBSTRING(regexp_replace(codigo_telefono, '[^0-9]', '', 'g'), 1, 2) INTO v_pp
  FROM paises
  WHERE v_digits LIKE regexp_replace(codigo_telefono, '[^0-9]', '', 'g') || '%'
  ORDER BY length(regexp_replace(codigo_telefono, '[^0-9]', '', 'g')) DESC
  LIMIT 1;
  v_pp := COALESCE(LPAD(v_pp, 2, '0'), '00');

  -- Si es México (52), decodificar lada -> estado/municipio
  IF v_pp = '52' THEN
    -- quitar prefijo 52 (y opcional '1' legado de móviles)
    v_local := v_digits;
    IF left(v_local, 3) = '521' AND length(v_local) >= 13 THEN
      v_local := substring(v_local from 4);
    ELSIF left(v_local, 2) = '52' AND length(v_local) >= 12 THEN
      v_local := substring(v_local from 3);
    END IF;

    v_l3 := left(v_local, 3);
    v_l2 := left(v_local, 2);

    -- Preferir match de 3 dígitos, luego 2
    SELECT cve_estado, cve_municipio INTO v_hit
    FROM mx_ladas WHERE lada = v_l3 LIMIT 1;
    IF v_hit.cve_estado IS NULL THEN
      SELECT cve_estado, cve_municipio INTO v_hit
      FROM mx_ladas WHERE lada = v_l2 LIMIT 1;
    END IF;

    IF v_hit.cve_estado IS NOT NULL THEN
      v_ee := v_hit.cve_estado;
      v_mmm := COALESCE(v_hit.cve_municipio, '000');
    END IF;
  END IF;

  RETURN QUERY SELECT v_pp, v_ee, v_mmm;
END;
$$;

-- Trigger para recalcular qard_number si cambia teléfono (y por lo tanto la lada)
CREATE OR REPLACE FUNCTION public.trg_qard_recalc_on_phone_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pp text; v_ee text; v_mmm text;
  v_current_bucket text;
  v_next integer;
  v_new_number text;
BEGIN
  IF NEW.telefono IS DISTINCT FROM OLD.telefono OR NEW.qard_nivel2_id IS DISTINCT FROM OLD.qard_nivel2_id THEN
    SELECT pp, ee, mmm INTO v_pp, v_ee, v_mmm FROM public.qard_bucket_for_user(NEW.user_id);
    v_current_bucket := COALESCE(substring(NEW.qard_number, 1, 7), '');
    IF v_current_bucket <> (v_pp || v_ee || v_mmm) THEN
      INSERT INTO qard_secuencia_municipio(pp, ee, mmm, next_id)
      VALUES (v_pp, v_ee, v_mmm, 2)
      ON CONFLICT (pp, ee, mmm)
      DO UPDATE SET next_id = qard_secuencia_municipio.next_id + 1
      RETURNING next_id - 1 INTO v_next;
      v_new_number := v_pp || v_ee || v_mmm || LPAD(v_next::text, 7, '0') || '00';
      NEW.qard_number := v_new_number;
      -- Sync titular sub-QR (sub_index=0) si existe
      UPDATE qard_sub_qr SET qard_number = v_new_number
      WHERE titular_user_id = NEW.user_id AND sub_index = 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qard_recalc_phone ON public.profiles;
CREATE TRIGGER trg_qard_recalc_phone
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_qard_recalc_on_phone_change();
