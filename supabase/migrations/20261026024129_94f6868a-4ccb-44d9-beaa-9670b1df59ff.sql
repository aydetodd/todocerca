-- La función solo puede actuar sobre la propia cuenta del usuario firmado (o del servidor)
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
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN RETURN; END IF;
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

REVOKE ALL ON FUNCTION public.qard_ensure_empresarial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qard_ensure_empresarial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qard_ensure_empresarial(uuid) TO service_role;

-- La función del disparador es interna: nadie la llama directamente
REVOKE ALL ON FUNCTION public.qard_trg_empresarial_on_moral() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_trg_empresarial_on_moral() TO service_role;