ALTER TABLE public.terminal_permissions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
ALTER TABLE public.terminal_invites ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS terminal_one_active_phone ON public.terminal_permissions(user_id) WHERE active AND status='accepted';

CREATE OR REPLACE FUNCTION public.terminal_set_active(_invite_id uuid,_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); inv public.terminal_invites; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_invite_id FOR UPDATE;
 IF inv.id IS NULL OR inv.status<>'accepted' OR inv.invited_user_id IS NULL THEN RAISE EXCEPTION 'Invitación no aceptada'; END IF;
 IF me<>inv.invited_user_id AND me<>inv.merchant_user_id THEN RAISE EXCEPTION 'Sin permiso'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(inv.invited_user_id::text,73));
 IF _active THEN
  IF NOT public.terminal_merchant_valid(inv.merchant_user_id) OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=inv.merchant_user_id AND sub_index=1 AND estado='activa') THEN RAISE EXCEPTION 'Activa primero la QaRd Empresarial'; END IF;
  UPDATE public.terminal_permissions SET active=false WHERE user_id=inv.invited_user_id;
  UPDATE public.terminal_invites SET active=false WHERE invited_user_id=inv.invited_user_id AND active;
  INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by,negocio_id,active,accepted_at) VALUES(inv.invited_user_id,inv.terminal_code,'accepted',inv.merchant_user_id,inv.negocio_id,true,now()) ON CONFLICT(user_id,terminal_code) DO UPDATE SET status='accepted',invited_by=EXCLUDED.invited_by,negocio_id=EXCLUDED.negocio_id,active=true,accepted_at=now();
 ELSE
  UPDATE public.terminal_permissions SET active=false WHERE user_id=inv.invited_user_id AND terminal_code=inv.terminal_code AND invited_by=inv.merchant_user_id;
 END IF;
 UPDATE public.terminal_invites SET active=_active WHERE id=inv.id;
END $$;
REVOKE ALL ON FUNCTION public.terminal_set_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_set_active(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.terminal_has_access(_user_id uuid,_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.terminal_permissions p JOIN public.terminal_catalog c ON c.code=p.terminal_code WHERE p.user_id=_user_id AND p.terminal_code=_code AND p.status='accepted' AND p.active AND c.operational AND public.terminal_merchant_valid(p.invited_by) AND EXISTS(SELECT 1 FROM public.qard_sub_qr s WHERE s.titular_user_id=p.invited_by AND s.sub_index=1 AND s.estado='activa'))
$$;
CREATE OR REPLACE FUNCTION public.terminal_business_snapshot(_code text DEFAULT 'collection') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid; result jsonb; BEGIN
 IF auth.uid() IS NULL OR NOT public.terminal_has_access(auth.uid(),_code) THEN RAISE EXCEPTION 'Enciende una terminal autorizada'; END IF;
 SELECT invited_by INTO owner FROM public.terminal_permissions WHERE user_id=auth.uid() AND terminal_code=_code AND status='accepted' AND active;
 SELECT jsonb_build_object('saldo_empresarial',coalesce(w.saldo_comercio_mxn,0),'negocio',a.business_name,'movimientos',coalesce((SELECT jsonb_agg(row_to_json(m)) FROM (SELECT id,tipo,monto_mxn,saldo_despues,descripcion,created_at,metadata FROM public.qard_movimientos WHERE titular_user_id=owner AND (ambito='cobros' OR tipo='cobro_recibido') ORDER BY created_at DESC LIMIT 80) m),'[]'::jsonb)) INTO result FROM public.qard_wallets w LEFT JOIN public.terminal_agent_requests a ON a.user_id=owner WHERE w.titular_user_id=owner;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.terminal_business_snapshot(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_business_snapshot(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.qard_sync_empresarial_saldo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.qard_sub_qr SET saldo_mxn=coalesce(NEW.saldo_comercio_mxn,0),updated_at=now() WHERE wallet_id=NEW.id AND sub_index=1;
 RETURN NEW; END $$;
CREATE TRIGGER trg_qard_sync_empresarial_saldo AFTER UPDATE OF saldo_comercio_mxn ON public.qard_wallets FOR EACH ROW EXECUTE FUNCTION public.qard_sync_empresarial_saldo();
-- Reconcile existing business funds without discarding a separately funded business card.
UPDATE public.qard_wallets w SET saldo_comercio_mxn=coalesce(w.saldo_comercio_mxn,0)+coalesce(s.saldo_mxn,0) FROM public.qard_sub_qr s WHERE s.wallet_id=w.id AND s.sub_index=1 AND s.saldo_mxn<>0;

CREATE OR REPLACE FUNCTION public.qard_collect_atomic(_number text,_amount numeric,_cvv text,_key uuid,_terminal boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); s public.qard_sub_qr; w public.qard_wallets; merchant public.qard_wallets; prior public.terminal_operations; next_balance numeric; current_balance numeric; merchant_id uuid; merchant_name text; result jsonb; business_id uuid; BEGIN
 IF me IS NULL OR NOT _terminal OR NOT public.terminal_has_access(me,'collection') THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 SELECT invited_by,negocio_id INTO merchant_id,business_id FROM public.terminal_permissions WHERE user_id=me AND terminal_code='collection' AND status='accepted' AND active;
 IF _key IS NULL OR _number IS NULL OR _number !~ '^\d{16}$' OR _cvv IS NULL OR _cvv !~ '^\d{3}$' OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Se requiere QaRd, monto y CVV de 3 dígitos del pagador'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(merchant_id::text||_key::text,2));
 SELECT * INTO prior FROM public.terminal_operations WHERE merchant_user_id=merchant_id AND request_key=_key;
 IF FOUND THEN IF prior.terminal_code<>'collection' OR prior.amount_mxn<>_amount OR prior.result->>'qard_number'<>_number OR prior.result->>'operador'<>me::text THEN RAISE EXCEPTION 'Operación utilizada con otros datos'; END IF; RETURN prior.result; END IF;
 IF NOT public.qard_rate_limit_check(me,'merchant_payment',10,60) THEN RAISE EXCEPTION 'Demasiados intentos. Espera un minuto'; END IF;
 SELECT * INTO s FROM public.qard_sub_qr WHERE qard_number=_number;
 IF s.id IS NULL OR s.titular_user_id=merchant_id THEN RAISE EXCEPTION 'Tarjeta no disponible para este cobro'; END IF;
 IF public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(merchant_id) OR public.cuenta_esta_bloqueada(s.titular_user_id) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 PERFORM id FROM public.qard_wallets WHERE titular_user_id IN (merchant_id,s.titular_user_id) ORDER BY id FOR UPDATE;
 SELECT * INTO w FROM public.qard_wallets WHERE id=s.wallet_id;
 SELECT * INTO merchant FROM public.qard_wallets WHERE titular_user_id=merchant_id;
 SELECT * INTO s FROM public.qard_sub_qr WHERE id=s.id FOR UPDATE;
 IF s.estado<>'activa' OR w.estado<>'activa' OR merchant.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta apagada'; END IF;
 IF s.sub_index>1 AND NOT coalesce(s.curp_verificada,false) THEN RAISE EXCEPTION 'Activa la sub-QR con CURP'; END IF;
 IF s.sub_index=1 AND NOT public.terminal_merchant_valid(s.titular_user_id) THEN RAISE EXCEPTION 'Empresarial no validada'; END IF;
 IF public.qard_dec(s.cvv) IS DISTINCT FROM _cvv THEN RAISE EXCEPTION 'CVV de 3 dígitos incorrecto'; END IF;
 IF s.limite_por_transaccion IS NOT NULL AND _amount>s.limite_por_transaccion THEN RAISE EXCEPTION 'Excede el límite por transacción'; END IF;
 IF s.horario_inicio IS NOT NULL AND s.horario_fin IS NOT NULL AND NOT (CASE WHEN s.horario_inicio<=s.horario_fin THEN (now() AT TIME ZONE 'America/Hermosillo')::time BETWEEN s.horario_inicio AND s.horario_fin ELSE (now() AT TIME ZONE 'America/Hermosillo')::time>=s.horario_inicio OR (now() AT TIME ZONE 'America/Hermosillo')::time<=s.horario_fin END) THEN RAISE EXCEPTION 'Fuera de horario permitido'; END IF;
 current_balance:=CASE WHEN s.sub_index=0 THEN w.saldo_mxn WHEN s.sub_index=1 THEN w.saldo_comercio_mxn ELSE s.saldo_mxn END;
 next_balance:=current_balance-_amount;
 IF next_balance < (CASE WHEN s.sub_index=0 THEN -50 ELSE 0 END) THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
 IF s.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=next_balance WHERE id=w.id;
 ELSIF s.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=next_balance WHERE id=w.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=next_balance WHERE id=s.id; END IF;
 UPDATE public.qard_wallets SET saldo_comercio_mxn=coalesce(saldo_comercio_mxn,0)+_amount WHERE id=merchant.id RETURNING saldo_comercio_mxn INTO merchant.saldo_comercio_mxn;
 SELECT business_name INTO merchant_name FROM public.terminal_agent_requests WHERE user_id=merchant_id;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,metadata) VALUES(w.id,s.titular_user_id,s.id,'cobro_comercio',_amount,next_balance,merchant_id,merchant_name,jsonb_build_object('bolsa',CASE WHEN s.sub_index=1 THEN 'comercio' ELSE 'personal' END,'terminal','collection','operador_id',me,'negocio_id',business_id,'operation_key',_key));
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,neto_comercio_mxn,metadata) VALUES(merchant.id,merchant_id,'cobro_recibido',_amount,merchant.saldo_comercio_mxn,merchant_id,merchant_name,_amount,jsonb_build_object('bolsa','comercio','terminal','collection','operador_id',me,'negocio_id',business_id,'operation_key',_key));
 result:=jsonb_build_object('ok',true,'qard_number',_number,'mensaje','COBRADO $'||_amount,'saldo_despues',next_balance,'neto',_amount,'sub_index',s.sub_index,'alias',s.alias,'operador',me);
 INSERT INTO public.terminal_operations(merchant_user_id,terminal_code,target_user_id,request_key,amount_mxn,result,negocio_id) VALUES(merchant_id,'collection',s.titular_user_id,_key,_amount,result,business_id);
 RETURN result; END $$;

CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(_from_numero16 text,_to_numero16 text,_cvv text,_monto numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); src public.qard_sub_qr; dst public.qard_sub_qr; sw public.qard_wallets; dw public.qard_wallets; a numeric; b numeric; expected text; next_cvv text; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _monto IS NULL OR _monto<=0 OR _monto<>round(_monto,2) OR _monto::text IN ('NaN','Infinity','-Infinity') OR _cvv IS NULL OR _cvv !~ '^\d{4}$' OR _from_numero16 IS NULL OR _to_numero16 IS NULL OR _from_numero16 !~ '^\d{16}$' OR _to_numero16 !~ '^\d{16}$' THEN RAISE EXCEPTION 'Monto, número o CVV dinámico de 4 dígitos inválido'; END IF;
 IF _from_numero16=_to_numero16 THEN RAISE EXCEPTION 'Origen y destino son la misma cuenta'; END IF;
 IF NOT public.qard_rate_limit_check(me,'qard_transfer_p2p',5,60) THEN RAISE EXCEPTION 'Espera un minuto'; END IF;
 SELECT * INTO src FROM public.qard_sub_qr WHERE qard_number=_from_numero16 AND titular_user_id=me;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE qard_number=_to_numero16;
 IF src.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'Cuenta no disponible'; END IF;
 PERFORM id FROM public.qard_wallets WHERE id IN (src.wallet_id,dst.wallet_id) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.qard_sub_qr WHERE id IN (src.id,dst.id) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM public.qard_sub_qr WHERE id=src.id;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE id=dst.id;
 SELECT * INTO sw FROM public.qard_wallets WHERE id=src.wallet_id;
 SELECT * INTO dw FROM public.qard_wallets WHERE id=dst.wallet_id;
 IF src.estado<>'activa' OR dst.estado<>'activa' OR sw.estado<>'activa' OR dw.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta apagada'; END IF;
 IF public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(dst.titular_user_id) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 IF (src.sub_index=1 AND NOT public.terminal_merchant_valid(me)) OR (dst.sub_index=1 AND NOT public.terminal_merchant_valid(dst.titular_user_id)) THEN RAISE EXCEPTION 'Empresarial no validada'; END IF;
 expected:=public.qard_dec(CASE WHEN dst.sub_index=0 THEN coalesce(dw.cvv_dinamico,dst.cvv_dinamico) ELSE dst.cvv_dinamico END);
 IF expected IS DISTINCT FROM _cvv THEN RAISE EXCEPTION 'CVV dinámico incorrecto o ya utilizado'; END IF;
 a:=CASE WHEN src.sub_index=0 THEN sw.saldo_mxn WHEN src.sub_index=1 THEN sw.saldo_comercio_mxn ELSE src.saldo_mxn END;
 IF a<_monto THEN RAISE EXCEPTION 'Saldo insuficiente en origen'; END IF;
 IF src.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn-_monto WHERE id=sw.id;
 ELSIF src.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn-_monto WHERE id=sw.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn-_monto WHERE id=src.id; END IF;
 -- Read after debit so same-owner cross-bucket transfers cannot overwrite a balance.
 SELECT * INTO dw FROM public.qard_wallets WHERE id=dst.wallet_id;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE id=dst.id;
 b:=CASE WHEN dst.sub_index=0 THEN dw.saldo_mxn WHEN dst.sub_index=1 THEN dw.saldo_comercio_mxn ELSE dst.saldo_mxn END;
 LOOP next_cvv:=public.gen_cvv4(); EXIT WHEN next_cvv<>expected; END LOOP;
 IF dst.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn+_monto,cvv_dinamico=public.qard_enc(next_cvv) WHERE id=dw.id;
 ELSIF dst.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn+_monto WHERE id=dw.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn+_monto WHERE id=dst.id; END IF;
 UPDATE public.qard_sub_qr SET cvv_dinamico=public.qard_enc(next_cvv) WHERE id=dst.id;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,descripcion,metadata) VALUES(sw.id,me,CASE WHEN src.sub_index=0 THEN NULL ELSE src.id END,'transferencia_p2p_out',_monto,a-_monto,'Transferencia enviada',jsonb_build_object('bolsa',CASE WHEN src.sub_index=1 THEN 'comercio' ELSE 'personal' END)),(dw.id,dst.titular_user_id,CASE WHEN dst.sub_index=0 THEN NULL ELSE dst.id END,'transferencia_p2p_in',_monto,b+_monto,'Transferencia recibida',jsonb_build_object('bolsa',CASE WHEN dst.sub_index=1 THEN 'comercio' ELSE 'personal' END));
 RETURN jsonb_build_object('ok',true); END $$;
REVOKE ALL ON FUNCTION public.qard_transfer_p2p(text,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_transfer_p2p(text,text,text,numeric) TO authenticated;

-- Restart only Martin's enterprise activation, preserve all balances and history.
UPDATE public.qard_sub_qr SET estado='apagada' WHERE id='069bc6dd-fc46-4dc7-87d4-0378f41a356b' AND titular_user_id='2e22a8ee-860e-40d2-ac2e-419c67651135';
UPDATE public.terminal_agent_requests SET status='revalidation',efirma_validada=false,empresa_validada=false,review_note='Pendiente de revalidación con e.firma' WHERE user_id='2e22a8ee-860e-40d2-ac2e-419c67651135';
UPDATE public.qard_identidad SET estado='moral_review' WHERE user_id='2e22a8ee-860e-40d2-ac2e-419c67651135' AND estado='moral_approved';
UPDATE public.terminal_permissions SET active=false WHERE invited_by='2e22a8ee-860e-40d2-ac2e-419c67651135';
UPDATE public.terminal_invites SET active=false WHERE merchant_user_id='2e22a8ee-860e-40d2-ac2e-419c67651135';