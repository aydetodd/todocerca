-- 1) Tipo de tarjeta: familiar (default) o empresarial
ALTER TABLE public.qard_sub_qr ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'familiar';

-- 2) Renumerar familiares existentes: 01 -> 02, 02 -> 03... (descendente para evitar colisiones)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, sub_index, qard_number
    FROM public.qard_sub_qr
    WHERE sub_index >= 1 AND tipo = 'familiar'
    ORDER BY titular_user_id, sub_index DESC
  LOOP
    UPDATE public.qard_sub_qr
    SET sub_index = r.sub_index + 1,
        qard_number = left(r.qard_number, 14) || lpad((r.sub_index + 1)::text, 2, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 3) La terminación 01 queda reservada exclusivamente para la QaRd Empresarial
ALTER TABLE public.qard_sub_qr
  ADD CONSTRAINT qard_sub_qr_indice01_empresarial CHECK (sub_index <> 1 OR tipo = 'empresarial'),
  ADD CONSTRAINT qard_sub_qr_empresarial_indice01 CHECK (tipo <> 'empresarial' OR sub_index = 1);

-- 4) Función: crea la QaRd Empresarial (terminación 01) cuando el comerciante está aprobado
CREATE OR REPLACE FUNCTION public.qard_ensure_empresarial(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_wallet uuid;
  v_base text;
  v_alias text;
BEGIN
  SELECT estado INTO v_estado FROM public.qard_identidad WHERE user_id = _user_id;
  IF v_estado IS DISTINCT FROM 'moral_approved' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id = _user_id AND tipo = 'empresarial') THEN RETURN; END IF;
  SELECT id INTO v_wallet FROM public.qard_wallets WHERE titular_user_id = _user_id;
  IF v_wallet IS NULL THEN RETURN; END IF;
  SELECT left(qard_number, 14) INTO v_base FROM public.profiles WHERE user_id = _user_id;
  IF v_base IS NULL OR length(v_base) <> 14 THEN RETURN; END IF;
  SELECT razon_social INTO v_alias FROM public.qard_moral_solicitudes
   WHERE user_id = _user_id AND estado = 'approved'
   ORDER BY revisado_at DESC NULLS LAST, created_at DESC LIMIT 1;
  INSERT INTO public.qard_sub_qr (wallet_id, titular_user_id, sub_index, qard_number, alias, tipo, estado)
  VALUES (v_wallet, _user_id, 1, v_base || '01', coalesce(nullif(v_alias, ''), 'Empresarial'), 'empresarial', 'activa');
END $$;

REVOKE ALL ON FUNCTION public.qard_ensure_empresarial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qard_ensure_empresarial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qard_ensure_empresarial(uuid) TO service_role;

-- 5) Trigger: al aprobar una cuenta Comerciante se crea su QaRd Empresarial sola
CREATE OR REPLACE FUNCTION public.qard_trg_empresarial_on_moral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'moral_approved' AND OLD.estado IS DISTINCT FROM 'moral_approved' THEN
    PERFORM public.qard_ensure_empresarial(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_qard_empresarial_on_moral ON public.qard_identidad;
CREATE TRIGGER trg_qard_empresarial_on_moral
AFTER UPDATE OF estado ON public.qard_identidad
FOR EACH ROW EXECUTE FUNCTION public.qard_trg_empresarial_on_moral();

-- 6) Backfill: comerciantes ya aprobados reciben su QaRd Empresarial
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT user_id FROM public.qard_identidad WHERE estado = 'moral_approved' LOOP
    PERFORM public.qard_ensure_empresarial(u.user_id);
  END LOOP;
END $$;