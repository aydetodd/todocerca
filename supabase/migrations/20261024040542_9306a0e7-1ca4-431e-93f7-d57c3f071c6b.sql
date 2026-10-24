CREATE TABLE public.terminal_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_user_id uuid NOT NULL, phone text NOT NULL, terminal_code text NOT NULL REFERENCES public.terminal_catalog(code), token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'pending', invited_user_id uuid, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(merchant_user_id, phone, terminal_code));
GRANT SELECT ON public.terminal_invites TO authenticated;
GRANT ALL ON public.terminal_invites TO service_role;
ALTER TABLE public.terminal_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY terminal_invites_read ON public.terminal_invites FOR SELECT TO authenticated USING (merchant_user_id=auth.uid() OR invited_user_id=auth.uid() OR (public.is_admin() AND public.has_role(auth.uid(),'admin')));
CREATE TRIGGER terminal_invites_updated BEFORE UPDATE ON public.terminal_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_invites;

CREATE OR REPLACE FUNCTION public.terminal_phone_matches(_a text,_b text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(public.normalize_phone(_a),'')=COALESCE(public.normalize_phone(_b),'') OR (length(COALESCE(public.normalize_phone(_a),''))>=10 AND length(COALESCE(public.normalize_phone(_b),''))>=10 AND right(public.normalize_phone(_a),10)=right(public.normalize_phone(_b),10))
$$;

CREATE OR REPLACE FUNCTION public.terminal_merchant_valid(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.terminal_agent_requests a WHERE a.user_id=_user_id AND a.status='approved' AND a.curp_status='valid' AND a.rfc_status='valid' AND a.biometric_status='valid')
$$;
REVOKE ALL ON FUNCTION public.terminal_merchant_valid(uuid) FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.terminal_invite_phone(_phone text,_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); v_token uuid; v_phone text; v_user uuid; v_existing public.terminal_invites; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF NOT public.terminal_merchant_valid(me) THEN RAISE EXCEPTION 'Tu solicitud de comercio debe estar aprobada y validada'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.terminal_catalog WHERE code=_code AND operational) THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
 v_phone:=COALESCE(public.normalize_phone(_phone),'');
 IF length(v_phone)<10 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
 SELECT * INTO v_existing FROM public.terminal_invites WHERE merchant_user_id=me AND phone=v_phone AND terminal_code=_code;
 IF FOUND THEN
  IF v_existing.status='accepted' THEN RAISE EXCEPTION 'Ese teléfono ya aceptó esta terminal'; END IF;
  IF v_existing.status='revoked' THEN UPDATE public.terminal_invites SET status='pending',invited_user_id=NULL,accepted_at=NULL,updated_at=now() WHERE id=v_existing.id; END IF;
  RETURN v_existing.token;
 END IF;
 INSERT INTO public.terminal_invites(merchant_user_id,phone,terminal_code) VALUES(me,v_phone,_code) RETURNING token INTO v_token;
 SELECT user_id INTO v_user FROM public.profiles p WHERE public.terminal_phone_matches(p.telefono,v_phone) LIMIT 1;
 IF v_user IS NOT NULL THEN
  IF v_user=me THEN
   UPDATE public.terminal_invites SET status='accepted',invited_user_id=me,accepted_at=now(),updated_at=now() WHERE merchant_user_id=me AND phone=v_phone AND terminal_code=_code;
   INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by) VALUES(me,_code,'accepted',me) ON CONFLICT(user_id,terminal_code) DO UPDATE SET status='accepted',invited_by=me,accepted_at=now();
  ELSE
   INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',v_user,'Invitación de terminal: '||(SELECT name FROM public.terminal_catalog WHERE code=_code)||'. Ábrela aquí: https://todocerca.mx/terminal-invitacion?token='||v_token,false);
  END IF;
 END IF;
 RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.terminal_invite_phone(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_invite_phone(text,text) TO authenticated;
COMMENT ON FUNCTION public.terminal_invite_phone(text,text) IS 'Intentional authenticated SECURITY DEFINER entry point: only fully verified merchants may invite a phone to operate a terminal; sends internal message with a personal link; inviting own phone auto-accepts.';

CREATE OR REPLACE FUNCTION public.terminal_accept_invite(_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); inv public.terminal_invites; v_phone text; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT telefono INTO v_phone FROM public.profiles WHERE user_id=me;
 SELECT * INTO inv FROM public.terminal_invites WHERE token=_token FOR UPDATE;
 IF inv.id IS NULL OR inv.status<>'pending' THEN RAISE EXCEPTION 'Invitación no disponible'; END IF;
 IF NOT public.terminal_phone_matches(inv.phone,v_phone) THEN RAISE EXCEPTION 'Esta invitación es para otro teléfono'; END IF;
 UPDATE public.terminal_invites SET status='accepted',invited_user_id=me,accepted_at=now(),updated_at=now() WHERE id=inv.id;
 INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by) VALUES(me,inv.terminal_code,'accepted',inv.merchant_user_id) ON CONFLICT(user_id,terminal_code) DO UPDATE SET status='accepted',invited_by=inv.merchant_user_id,accepted_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.terminal_accept_invite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_accept_invite(uuid) TO authenticated;
COMMENT ON FUNCTION public.terminal_accept_invite(uuid) IS 'Intentional authenticated SECURITY DEFINER entry point: only the invited phone may accept a pending terminal invitation; links access to the merchant.';

CREATE OR REPLACE FUNCTION public.terminal_revoke_invite(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); inv public.terminal_invites; BEGIN
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_id FOR UPDATE;
 IF inv.id IS NULL THEN RAISE EXCEPTION 'Invitación no encontrada'; END IF;
 IF NOT (inv.merchant_user_id=me OR (public.is_admin() AND public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Sin permiso para revocar'; END IF;
 IF inv.status='revoked' THEN RETURN; END IF;
 UPDATE public.terminal_invites SET status='revoked',updated_at=now() WHERE id=inv.id;
 IF inv.invited_user_id IS NOT NULL THEN UPDATE public.terminal_permissions SET status='revoked',accepted_at=NULL WHERE user_id=inv.invited_user_id AND terminal_code=inv.terminal_code AND invited_by=inv.merchant_user_id; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.terminal_revoke_invite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_revoke_invite(uuid) TO authenticated;
COMMENT ON FUNCTION public.terminal_revoke_invite(uuid) IS 'Intentional authenticated SECURITY DEFINER entry point: merchant or admin revokes an invitation and its granted terminal access.';

DROP FUNCTION IF EXISTS public.terminal_invite(uuid,text,boolean);

CREATE OR REPLACE FUNCTION public.terminal_has_access(_user_id uuid,_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.terminal_permissions p JOIN public.terminal_catalog c ON c.code=p.terminal_code WHERE p.user_id=_user_id AND p.terminal_code=_code AND p.status='accepted' AND c.operational AND public.terminal_merchant_valid(p.invited_by))
$$;
REVOKE ALL ON FUNCTION public.terminal_has_access(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_has_access(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.terminal_reload(_number text,_amount numeric,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); owner uuid; target uuid; w public.qard_wallets; recipient public.qard_wallets; pending boolean; opening numeric:=0; net numeric; lim record; prev public.terminal_operations; result jsonb; BEGIN
 IF me IS NULL OR NOT public.terminal_has_access(me,'reload') THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 SELECT invited_by INTO owner FROM public.terminal_permissions WHERE user_id=me AND terminal_code='reload' AND status='accepted';
 IF owner IS NULL THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 IF _key IS NULL OR _number !~ '^[0-9]{16}$' OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||_key::text,2));
 SELECT * INTO prev FROM public.terminal_operations WHERE merchant_user_id=owner AND request_key=_key;
 IF FOUND THEN IF prev.terminal_code<>'reload' OR prev.amount_mxn<>_amount OR prev.result->>'qard_number'<>_number THEN RAISE EXCEPTION 'Operación duplicada con otros datos'; END IF; RETURN prev.result; END IF;
 SELECT titular_user_id INTO target FROM public.qard_sub_qr WHERE qard_number=_number AND sub_index=0 AND estado='activa';
 IF target IS NULL OR target=owner OR target=me THEN RAISE EXCEPTION 'Usa la QaRd principal de un cliente'; END IF;
 IF public.cuenta_esta_bloqueada(owner) OR public.cuenta_esta_bloqueada(target) OR public.cuenta_esta_bloqueada(me) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,0));
 SELECT account_opening_fee_pending INTO pending FROM public.qard_identidad WHERE user_id=target AND estado IN ('active','moral_approved') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El cliente debe activar su identidad'; END IF;
 IF COALESCE(pending,true) THEN opening:=150; END IF; net:=_amount-opening-15;
 IF net<=0 THEN RAISE EXCEPTION 'El monto debe superar $%',opening+15; END IF;
 SELECT * INTO lim FROM public.qard_limite_recarga(target);
 IF lim.disponible IS NOT NULL AND net>lim.disponible THEN RAISE EXCEPTION 'Supera el límite mensual del cliente'; END IF;
 PERFORM id FROM public.qard_wallets WHERE titular_user_id IN (owner,target) ORDER BY id FOR UPDATE;
 SELECT * INTO w FROM public.qard_wallets WHERE titular_user_id=owner;
 SELECT * INTO recipient FROM public.qard_wallets WHERE titular_user_id=target;
 IF w.id IS NULL OR recipient.id IS NULL OR w.estado<>'activa' OR recipient.estado<>'activa' OR w.saldo_mxn<_amount THEN RAISE EXCEPTION 'Saldo insuficiente del comercio'; END IF;
 UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn-_amount+5 WHERE id=w.id RETURNING saldo_mxn INTO w.saldo_mxn;
 UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn+net WHERE id=recipient.id RETURNING saldo_mxn INTO recipient.saldo_mxn;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,descripcion,metadata) VALUES(w.id,owner,'transferencia_p2p_out',_amount,w.saldo_mxn-5,'Fondos para recarga de cliente',jsonb_build_object('terminal','reload','operation_key',_key,'comerciante_id',owner,'operador_id',me,'cliente_id',target)),(w.id,owner,'transferencia_p2p_in',5,w.saldo_mxn,'Comisión operativa de recarga',jsonb_build_object('terminal','reload','operation_key',_key,'comerciante_id',owner,'operador_id',me,'comision_comercio',5,'comision_plataforma',10));
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,comision_mxn,descripcion,metadata) VALUES(recipient.id,target,'recarga',net,recipient.saldo_mxn,opening+15,'Recarga en comercio',jsonb_build_object('terminal','reload','comerciante_id',owner,'operador_id',me,'operation_key',_key,'monto_transferido',_amount,'apertura',opening,'comision_recarga',15,'comision_comercio',5,'comision_plataforma',10));
 IF opening>0 THEN PERFORM public.qard_cobrar_comision(target,'account_opening',opening,_amount,NULL,'Activación de QaRd',_key::text,_number); UPDATE public.qard_identidad SET account_opening_fee_pending=false,account_opening_fee_amount=150 WHERE user_id=target; END IF;
 PERFORM public.qard_cobrar_comision(target,'reload_fee',10,_amount,NULL,'Comisión por recarga en comercio',_key::text,_number);
 result:=jsonb_build_object('ok',true,'qard_number',_number,'neto',net,'apertura',opening,'comision_comercio',5,'comision_plataforma',10,'saldo',recipient.saldo_mxn,'saldo_comercio',w.saldo_mxn,'operador',me);
 INSERT INTO public.terminal_operations(merchant_user_id,terminal_code,target_user_id,request_key,amount_mxn,merchant_commission_mxn,platform_commission_mxn,opening_fee_mxn,result) VALUES(owner,'reload',target,_key,_amount,5,10,opening,result);
 INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',target,format('Recarga en comercio: $%s recibidos; $%s acreditados; $%s activación; $15 comisión.',_amount,net,opening),false);
 RETURN result; END; $$;
REVOKE ALL ON FUNCTION public.terminal_reload(text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_reload(text,numeric,uuid) TO authenticated;
COMMENT ON FUNCTION public.terminal_reload(text,numeric,uuid) IS 'Intentional authenticated SECURITY DEFINER: accepted operators of verified merchants debit the merchant wallet; atomic and idempotent.';

CREATE OR REPLACE FUNCTION public.qard_collect_atomic(_number text,_amount numeric,_cvv text,_key uuid,_terminal boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); s public.qard_sub_qr; w public.qard_wallets; merchant public.qard_wallets; prior public.terminal_operations; expected text; next_balance numeric; current_balance numeric; minimum numeric; merchant_name text; legal_name text; result jsonb; hhmm time; limit_info record; merchant_id uuid; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _terminal THEN
  IF NOT public.terminal_has_access(me,'collection') THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
  SELECT invited_by INTO merchant_id FROM public.terminal_permissions WHERE user_id=me AND terminal_code='collection' AND status='accepted';
  IF merchant_id IS NULL THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 ELSE merchant_id:=me; END IF;
 IF _key IS NULL OR _number !~ '^[0-9]{16}$' OR _cvv !~ '^[0-9]{4}$' OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Número, monto o CVV dinámico inválidos'; END IF;
 IF public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(merchant_id) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(merchant_id::text||_key::text,2));
 SELECT * INTO prior FROM public.terminal_operations WHERE merchant_user_id=merchant_id AND request_key=_key;
 IF FOUND THEN IF prior.terminal_code<>'collection' OR prior.amount_mxn<>_amount OR prior.result->>'qard_number'<>_number THEN RAISE EXCEPTION 'Operación utilizada con otros datos'; END IF; RETURN prior.result; END IF;
 SELECT * INTO s FROM public.qard_sub_qr WHERE qard_number=_number;
 IF s.id IS NULL OR s.titular_user_id=me OR s.titular_user_id=merchant_id THEN RAISE EXCEPTION 'Tarjeta no disponible para este cobro'; END IF;
 IF public.cuenta_esta_bloqueada(s.titular_user_id) THEN RAISE EXCEPTION 'Tarjeta bloqueada'; END IF;
 PERFORM public.qard_ensure_wallet(merchant_id);
 PERFORM id FROM public.qard_wallets WHERE titular_user_id IN (merchant_id,s.titular_user_id) ORDER BY id FOR UPDATE;
 SELECT * INTO w FROM public.qard_wallets WHERE id=s.wallet_id;
 SELECT * INTO merchant FROM public.qard_wallets WHERE titular_user_id=merchant_id;
 SELECT * INTO s FROM public.qard_sub_qr WHERE id=s.id FOR UPDATE;
 IF s.estado<>'activa' OR w.estado<>'activa' OR merchant.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta o billetera apagada'; END IF;
 IF s.sub_index>0 AND NOT s.curp_verificada THEN RAISE EXCEPTION 'Activa la sub-QR con CURP'; END IF;
 expected:=public.qard_dec(CASE WHEN s.sub_index=0 THEN COALESCE(w.cvv_dinamico,s.cvv_dinamico) ELSE s.cvv_dinamico END);
 IF expected IS NULL OR expected<>_cvv THEN RAISE EXCEPTION 'CVV dinámico incorrecto o ya utilizado'; END IF;
 IF s.limite_por_transaccion IS NOT NULL AND _amount>s.limite_por_transaccion THEN RAISE EXCEPTION 'Excede el límite por transacción'; END IF;
 hhmm:=(now() AT TIME ZONE 'America/Hermosillo')::time;
 IF s.horario_inicio IS NOT NULL AND s.horario_fin IS NOT NULL AND ((s.horario_inicio<=s.horario_fin AND (hhmm<s.horario_inicio OR hhmm>s.horario_fin)) OR (s.horario_inicio>s.horario_fin AND hhmm>s.horario_fin AND hhmm<s.horario_inicio)) THEN RAISE EXCEPTION 'Fuera de horario permitido'; END IF;
 SELECT * INTO limit_info FROM public.qard_limite_cobros(merchant_id);
 IF limit_info.disponible IS NOT NULL AND _amount>limit_info.disponible THEN RAISE EXCEPTION 'Supera tu límite mensual de cobros'; END IF;
 current_balance:=CASE WHEN s.sub_index=0 THEN w.saldo_mxn ELSE s.saldo_mxn END;
 minimum:=CASE WHEN s.sub_index=0 THEN -50 ELSE 0 END;
 next_balance:=current_balance-_amount;
 IF next_balance<minimum THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
 IF s.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=next_balance,cvv_dinamico=public.qard_enc('') WHERE id=w.id; UPDATE public.qard_sub_qr SET cvv_dinamico=public.qard_enc('') WHERE id=s.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=next_balance,cvv_dinamico=public.qard_enc('') WHERE id=s.id; END IF;
 UPDATE public.qard_wallets SET saldo_comercio_mxn=COALESCE(saldo_comercio_mxn,0)+_amount WHERE id=merchant.id RETURNING saldo_comercio_mxn INTO merchant.saldo_comercio_mxn;
 SELECT COALESCE(apodo,nombre,'Comercio') INTO merchant_name FROM public.profiles WHERE user_id=merchant_id;
 legal_name:=public.qard_nombre_legal(s.titular_user_id);
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,descripcion,metadata) VALUES(w.id,s.titular_user_id,s.id,'cobro_comercio',_amount,next_balance,merchant_id,merchant_name,'Cobro en '||merchant_name,jsonb_build_object('terminal',CASE WHEN _terminal THEN 'collection' ELSE NULL END,'operation_key',_key,'comerciante_id',merchant_id,'operador_id',me,'cliente_id',s.titular_user_id,'sub_index',s.sub_index,'alias',s.alias,'lado','cargo','comision_comercio',0,'comision_plataforma',0));
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,neto_comercio_mxn,descripcion,metadata) VALUES(merchant.id,merchant_id,'cobro_recibido',_amount,merchant.saldo_comercio_mxn,me,merchant_name,_amount,'Cobro recibido de '||COALESCE(legal_name,'cliente'),jsonb_build_object('terminal',CASE WHEN _terminal THEN 'collection' ELSE NULL END,'operation_key',_key,'comerciante_id',merchant_id,'operador_id',me,'cliente_id',s.titular_user_id,'lado','abono','bolsa','comercio'));
 result:=jsonb_build_object('ok',true,'qard_number',_number,'estado','cobrado','color','verde','mensaje','COBRADO $'||_amount,'saldo_despues',next_balance,'comision',0,'neto',_amount,'alias',s.alias,'sub_index',s.sub_index,'titular_nombre',legal_name,'operador',me);
 INSERT INTO public.terminal_operations(merchant_user_id,terminal_code,target_user_id,request_key,amount_mxn,result) VALUES(merchant_id,'collection',s.titular_user_id,_key,_amount,result);
 INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',s.titular_user_id,format('QaRd: cobro de $%s en %s. Saldo: $%s. CVV dinámico utilizado.',_amount,merchant_name,next_balance),false);
 RETURN result; END; $$;
REVOKE ALL ON FUNCTION public.qard_collect_atomic(text,numeric,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_collect_atomic(text,numeric,text,uuid,boolean) TO authenticated;
COMMENT ON FUNCTION public.qard_collect_atomic(text,numeric,text,uuid,boolean) IS 'Intentional authenticated SECURITY DEFINER entry point: validates auth.uid, account locks, funds, dynamic CVV and optional terminal permissions; terminal collections credit the merchant wallet that invited the operator. Never callable by anon.';