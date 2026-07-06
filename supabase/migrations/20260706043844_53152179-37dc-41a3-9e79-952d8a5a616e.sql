
-- Trigger de generación de QaRd: solo dispara si ya se eligió municipio
CREATE OR REPLACE FUNCTION public.qard_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.qard_nivel2_id IS NOT NULL THEN
    PERFORM public.qard_ensure_number(NEW.user_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'qard_on_profile_insert error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- RPC que la app llama tras el registro para fijar municipio y generar QaRd
CREATE OR REPLACE FUNCTION public.qard_finalize_registration(_nivel2_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_current_nivel uuid;
  v_current_qard text;
  v_number text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT qard_nivel2_id, qard_number INTO v_current_nivel, v_current_qard
    FROM profiles WHERE user_id = v_user;

  -- Si ya tenía nivel2 y QaRd, no se puede cambiar (respeta trigger de inmutabilidad)
  IF v_current_qard IS NOT NULL AND length(v_current_qard) = 16
     AND v_current_nivel IS NOT NULL AND v_current_nivel <> _nivel2_id THEN
    RAISE EXCEPTION 'QARD_MUNICIPIO_INMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  -- Validar municipio
  IF NOT EXISTS (SELECT 1 FROM subdivisiones_nivel2 WHERE id = _nivel2_id) THEN
    RAISE EXCEPTION 'MUNICIPIO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;

  -- Fijar municipio si aún no estaba
  IF v_current_nivel IS NULL THEN
    UPDATE profiles SET qard_nivel2_id = _nivel2_id WHERE user_id = v_user;
  END IF;

  -- Generar QaRd (usa el bucket del municipio elegido)
  v_number := public.qard_ensure_number(v_user);
  RETURN v_number;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.qard_finalize_registration(uuid) TO authenticated;
