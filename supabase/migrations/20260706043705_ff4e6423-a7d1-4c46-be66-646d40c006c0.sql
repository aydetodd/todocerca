
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.subdivisiones_nivel1 ADD COLUMN IF NOT EXISTS cve_estado varchar(2);
ALTER TABLE public.subdivisiones_nivel2 ADD COLUMN IF NOT EXISTS cve_municipio varchar(3);
CREATE INDEX IF NOT EXISTS idx_nivel1_cve_estado ON public.subdivisiones_nivel1(cve_estado);
CREATE INDEX IF NOT EXISTS idx_nivel2_cve_municipio ON public.subdivisiones_nivel2(nivel1_id, cve_municipio);

UPDATE public.subdivisiones_nivel1 n1
SET cve_estado = LPAD(e.cve_estado::text, 2, '0')
FROM public.mx_inegi_estados e
WHERE n1.pais_id = (SELECT id FROM public.paises WHERE codigo_iso='MX')
  AND n1.cve_estado IS NULL
  AND lower(public.unaccent(n1.nombre::text)) = lower(public.unaccent(e.nombre::text));

UPDATE public.subdivisiones_nivel2 n2
SET cve_municipio = LPAD(m.cve_municipio::text, 3, '0')
FROM public.mx_inegi_municipios m, public.subdivisiones_nivel1 n1
WHERE n2.nivel1_id = n1.id
  AND n2.cve_municipio IS NULL
  AND n1.cve_estado = LPAD(m.cve_estado::text, 2, '0')
  AND lower(public.unaccent(n2.nombre::text)) = lower(public.unaccent(m.nombre::text));

CREATE OR REPLACE FUNCTION public.qard_bucket_for_user(_user_id uuid)
RETURNS TABLE(pp text, ee text, mmm text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_nivel2_id uuid; v_tel text; v_digits text;
  v_pp text := '00'; v_ee text := '00'; v_mmm text := '000';
  v_local text; v_l3 text; v_l2 text; v_hit record;
BEGIN
  SELECT qard_nivel2_id, telefono INTO v_nivel2_id, v_tel FROM profiles WHERE user_id = _user_id LIMIT 1;

  IF v_nivel2_id IS NOT NULL THEN
    SELECT
      LPAD(SUBSTRING(regexp_replace(p.codigo_telefono,'[^0-9]','','g'),1,2),2,'0'),
      COALESCE(n1.cve_estado,'00'),
      COALESCE(n2.cve_municipio,'000')
    INTO v_pp, v_ee, v_mmm
    FROM subdivisiones_nivel2 n2
    JOIN subdivisiones_nivel1 n1 ON n1.id = n2.nivel1_id
    JOIN paises p ON p.id = n1.pais_id
    WHERE n2.id = v_nivel2_id;
    RETURN QUERY SELECT v_pp, v_ee, v_mmm; RETURN;
  END IF;

  IF v_tel IS NULL OR btrim(v_tel) = '' THEN
    RETURN QUERY SELECT v_pp, v_ee, v_mmm; RETURN;
  END IF;

  v_digits := regexp_replace(v_tel, '[^0-9]', '', 'g');
  SELECT SUBSTRING(regexp_replace(codigo_telefono,'[^0-9]','','g'),1,2) INTO v_pp
  FROM paises WHERE v_digits LIKE regexp_replace(codigo_telefono,'[^0-9]','','g') || '%'
  ORDER BY length(regexp_replace(codigo_telefono,'[^0-9]','','g')) DESC LIMIT 1;
  v_pp := COALESCE(LPAD(v_pp,2,'0'),'00');

  IF v_pp = '52' THEN
    v_local := v_digits;
    IF left(v_local,3) = '521' AND length(v_local) >= 13 THEN v_local := substring(v_local from 4);
    ELSIF left(v_local,2) = '52' AND length(v_local) >= 12 THEN v_local := substring(v_local from 3); END IF;
    v_l3 := left(v_local,3); v_l2 := left(v_local,2);
    SELECT cve_estado, cve_municipio INTO v_hit FROM mx_ladas WHERE lada = v_l3 LIMIT 1;
    IF v_hit.cve_estado IS NULL THEN
      SELECT cve_estado, cve_municipio INTO v_hit FROM mx_ladas WHERE lada = v_l2 LIMIT 1;
    END IF;
    IF v_hit.cve_estado IS NOT NULL THEN
      v_ee := v_hit.cve_estado; v_mmm := COALESCE(v_hit.cve_municipio,'000');
    END IF;
  END IF;
  RETURN QUERY SELECT v_pp, v_ee, v_mmm;
END;
$function$;

CREATE OR REPLACE FUNCTION public.qard_ensure_number(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_existing text; v_pp text; v_ee text; v_mmm text; v_next integer; v_number text;
BEGIN
  SELECT qard_number INTO v_existing FROM profiles WHERE user_id = _user_id;
  IF v_existing IS NOT NULL AND length(v_existing) = 16 THEN RETURN v_existing; END IF;

  SELECT * INTO v_pp, v_ee, v_mmm FROM public.qard_bucket_for_user(_user_id);

  INSERT INTO qard_secuencia_municipio(pp, ee, mmm, next_id)
  VALUES (v_pp, v_ee, v_mmm, 2)
  ON CONFLICT (pp, ee, mmm) DO UPDATE SET next_id = qard_secuencia_municipio.next_id + 1
  RETURNING next_id - 1 INTO v_next;

  IF v_next > 9999999 THEN
    UPDATE qard_secuencia_municipio SET next_id = next_id - 1
      WHERE pp = v_pp AND ee = v_ee AND mmm = v_mmm;
    RAISE EXCEPTION 'MUNICIPIO_AGOTADO: el municipio (%,%,%) alcanzó el máximo de 9,999,999 usuarios.', v_pp, v_ee, v_mmm
      USING ERRCODE = 'P0001';
  END IF;

  v_number := v_pp || v_ee || v_mmm || LPAD(v_next::text, 7, '0') || '00';
  UPDATE profiles SET qard_number = v_number WHERE user_id = _user_id;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_profiles_lock_nivel2()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.qard_number IS NOT NULL AND OLD.qard_nivel2_id IS NOT NULL
     AND NEW.qard_nivel2_id IS DISTINCT FROM OLD.qard_nivel2_id THEN
    RAISE EXCEPTION 'QARD_MUNICIPIO_INMUTABLE: no se puede cambiar el municipio de un QaRd ya asignado.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_profiles_lock_nivel2 ON public.profiles;
CREATE TRIGGER tg_profiles_lock_nivel2
BEFORE UPDATE OF qard_nivel2_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_lock_nivel2();
