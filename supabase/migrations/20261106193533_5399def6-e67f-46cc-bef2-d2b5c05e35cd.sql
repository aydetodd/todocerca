CREATE OR REPLACE FUNCTION public.terminal_validate_records()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN
 IF TG_TABLE_NAME='terminal_agent_requests' THEN
 IF NEW.status NOT IN ('pending','approved','rejected','suspended','revalidation') OR NEW.curp_status NOT IN ('pending','valid','invalid','not_required') OR NEW.rfc_status NOT IN ('pending','valid','invalid') OR NEW.biometric_status NOT IN ('pending','valid','invalid','not_required') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 IF NEW.status='approved' AND NOT (
   (NEW.curp_status='valid' AND NEW.rfc_status='valid' AND NEW.biometric_status='valid')
   OR (NEW.efirma_validada AND NEW.rfc_status='valid')) THEN RAISE EXCEPTION 'Falta verificación real'; END IF;
 IF length(btrim(NEW.business_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
 ELSIF TG_TABLE_NAME='terminal_permissions' THEN
 IF NEW.status NOT IN ('pending','accepted','revoked') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 ELSIF TG_TABLE_NAME='terminal_operations' THEN
 IF NEW.amount_mxn<=0 OR NEW.amount_mxn::text IN ('NaN','Infinity','-Infinity') OR NEW.merchant_commission_mxn<0 OR NEW.platform_commission_mxn<0 THEN RAISE EXCEPTION 'Importes inválidos'; END IF;
 IF NEW.terminal_code='reload' AND (NEW.merchant_commission_mxn<>5 OR NEW.platform_commission_mxn<>10 OR NEW.opening_fee_mxn NOT IN (0,150)) THEN RAISE EXCEPTION 'Reparto inválido'; END IF;
 END IF; RETURN NEW; END; $function$;

ALTER TABLE public.terminal_agent_requests
  ADD COLUMN IF NOT EXISTS tipo_persona text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS representante_nombre text,
  ADD COLUMN IF NOT EXISTS empresa_validada boolean NOT NULL DEFAULT false;

UPDATE public.qard_sub_qr SET estado='apagada', updated_at=now() WHERE tipo='empresarial' AND estado='activa';
UPDATE public.qard_identidad SET estado='moral_review' WHERE estado='moral_approved';
UPDATE public.terminal_agent_requests SET status='revalidation', efirma_validada=false, empresa_validada=false,
  review_note='Pendiente de revalidación con e.firma' WHERE status <> 'revalidation';

CREATE OR REPLACE FUNCTION public.qard_sub_set_estado(_sub_qr_id uuid, _estado text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid UUID := auth.uid(); _sub public.qard_sub_qr;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _estado NOT IN ('activa','apagada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT * INTO _sub FROM public.qard_sub_qr WHERE id = _sub_qr_id;
  IF _sub.id IS NULL THEN RAISE EXCEPTION 'Sub-QR no encontrada'; END IF;
  IF _sub.titular_user_id <> _uid THEN RAISE EXCEPTION 'No es tu sub-QR'; END IF;
  IF _sub.estado = 'cancelada' THEN RAISE EXCEPTION 'Sub-QR cancelada'; END IF;
  IF _sub.tipo = 'empresarial' AND _estado = 'activa' AND NOT EXISTS (
    SELECT 1 FROM public.qard_identidad WHERE user_id=_uid AND estado='moral_approved') THEN
    RAISE EXCEPTION 'Tu tarjeta Empresarial está pendiente de revalidación con e.firma';
  END IF;
  UPDATE public.qard_sub_qr SET estado = _estado, updated_at = now() WHERE id = _sub_qr_id;
  RETURN _estado;
END; $function$;

CREATE OR REPLACE FUNCTION public.qard_registrar_empresa_efirma(
  _rfc text, _tipo text, _razon_social text, _representante text, _vence timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tipo NOT IN ('moral','fisica') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  _rfc := upper(trim(_rfc));
  IF (_tipo='moral' AND _rfc !~ '^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$') OR (_tipo='fisica' AND _rfc !~ '^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$') THEN
    RAISE EXCEPTION 'RFC inválido'; END IF;
  IF _vence < now() - interval '60 days' THEN RAISE EXCEPTION 'e.firma vencida'; END IF;
  INSERT INTO public.terminal_agent_requests (user_id, business_name, rfc_document, status, curp_status, rfc_status, biometric_status,
    efirma_validada, efirma_nombre, efirma_vence, tipo_persona, razon_social, representante_nombre, empresa_validada, review_note)
  SELECT _uid, coalesce(nullif(_razon_social,''), _representante), 'efirma-local', 'approved', 'not_required', 'valid', 'not_required',
    true, _representante, _vence, _tipo, nullif(_razon_social,''), _representante, true, null
  WHERE NOT EXISTS (SELECT 1 FROM public.terminal_agent_requests WHERE user_id=_uid);
  UPDATE public.terminal_agent_requests SET business_name=coalesce(nullif(_razon_social,''), _representante), rfc_document='efirma-local',
    status='approved', rfc_status='valid', efirma_validada=true, efirma_nombre=_representante, efirma_vence=_vence, tipo_persona=_tipo,
    razon_social=nullif(_razon_social,''), representante_nombre=_representante, empresa_validada=true, review_note=null, updated_at=now()
  WHERE user_id=_uid;
  IF _tipo='moral' THEN
    UPDATE public.qard_identidad SET estado='moral_approved' WHERE user_id=_uid AND estado IN ('active','moral_review','moral_approved');
    UPDATE public.qard_sub_qr SET estado='activa', updated_at=now() WHERE titular_user_id=_uid AND tipo='empresarial' AND estado='apagada';
    PERFORM public.qard_ensure_empresarial(_uid);
  END IF;
END; $function$;
REVOKE ALL ON FUNCTION public.qard_registrar_empresa_efirma(text,text,text,text,timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.qard_registrar_empresa_efirma(text,text,text,text,timestamptz) TO authenticated;