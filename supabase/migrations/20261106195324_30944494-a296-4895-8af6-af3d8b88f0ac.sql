ALTER TABLE public.terminal_agent_requests ADD COLUMN IF NOT EXISTS efirma_rfc text;

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
    efirma_validada, efirma_nombre, efirma_vence, tipo_persona, razon_social, representante_nombre, empresa_validada, review_note, efirma_rfc)
  SELECT _uid, coalesce(nullif(_razon_social,''), _representante), 'efirma-local', 'approved', 'not_required', 'valid', 'not_required',
    true, _representante, _vence, _tipo, nullif(_razon_social,''), _representante, true, null, _rfc
  WHERE NOT EXISTS (SELECT 1 FROM public.terminal_agent_requests WHERE user_id=_uid);
  UPDATE public.terminal_agent_requests SET business_name=coalesce(nullif(_razon_social,''), _representante), rfc_document='efirma-local',
    status='approved', rfc_status='valid', efirma_validada=true, efirma_nombre=_representante, efirma_vence=_vence, tipo_persona=_tipo,
    razon_social=nullif(_razon_social,''), representante_nombre=_representante, empresa_validada=true, review_note=null, efirma_rfc=_rfc, updated_at=now()
  WHERE user_id=_uid;
  IF _tipo='moral' THEN
    UPDATE public.qard_identidad SET estado='moral_approved' WHERE user_id=_uid AND estado IN ('active','moral_review','moral_approved');
    UPDATE public.qard_sub_qr SET estado='activa', updated_at=now() WHERE titular_user_id=_uid AND tipo='empresarial' AND estado='apagada';
    PERFORM public.qard_ensure_empresarial(_uid);
  END IF;
END; $function$;
REVOKE ALL ON FUNCTION public.qard_registrar_empresa_efirma(text,text,text,text,timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.qard_registrar_empresa_efirma(text,text,text,text,timestamptz) TO authenticated;