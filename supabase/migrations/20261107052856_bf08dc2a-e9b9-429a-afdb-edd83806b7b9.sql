CREATE OR REPLACE FUNCTION public.tg_qard_mov_ambito() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE _idx int; BEGIN
 IF NEW.sub_qr_id IS NOT NULL THEN SELECT sub_index INTO _idx FROM public.qard_sub_qr WHERE id=NEW.sub_qr_id; END IF;
 IF NEW.ambito IS NULL THEN NEW.ambito:=CASE WHEN NEW.metadata->>'bolsa'='comercio' OR NEW.tipo IN ('cobro_recibido','traspaso_cobros_out') THEN 'cobros' WHEN NEW.tipo IN ('recarga','comision','transfer_a_sub','transfer_desde_sub','traspaso_cobros_in','ajuste') THEN 'eje' WHEN coalesce(_idx,0)>0 THEN 'sub_qr' ELSE 'eje' END; END IF;
 IF NEW.direccion IS NULL THEN NEW.direccion:=CASE WHEN NEW.tipo IN ('recarga','cobro_recibido','traspaso_cobros_in','transferencia_p2p_in','transfer_desde_sub','devolucion') OR (NEW.tipo='ajuste' AND NEW.monto_mxn>=0) THEN 'entrada' ELSE 'salida' END; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.qard_pay_business(_from text,_merchant text,_amount numeric,_cvv text,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); src public.qard_sub_qr; dst public.qard_sub_qr; sw public.qard_wallets; dw public.qard_wallets; prior public.terminal_operations; a numeric; result jsonb; BEGIN
 IF me IS NULL OR _from IS NULL OR _merchant IS NULL OR _from !~ '^\d{16}$' OR _merchant !~ '^\d{16}$' OR _cvv IS NULL OR _cvv !~ '^\d{3}$' OR _key IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Se requiere QR empresarial, monto y CVV de 3 dígitos del pagador'; END IF;
 SELECT * INTO src FROM public.qard_sub_qr WHERE qard_number=_from AND titular_user_id=me;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE qard_number=_merchant AND sub_index=1;
 IF src.id IS NULL OR dst.id IS NULL OR dst.titular_user_id=me THEN RAISE EXCEPTION 'Tarjetas no disponibles'; END IF;
 IF NOT public.terminal_merchant_valid(dst.titular_user_id) OR public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(dst.titular_user_id) THEN RAISE EXCEPTION 'Comercio no disponible'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dst.titular_user_id::text||_key::text,2));
 SELECT * INTO prior FROM public.terminal_operations WHERE merchant_user_id=dst.titular_user_id AND request_key=_key;
 IF FOUND THEN IF prior.target_user_id<>me OR prior.amount_mxn<>_amount OR prior.result->>'qard_number'<>_from THEN RAISE EXCEPTION 'Operación utilizada con otros datos'; END IF; RETURN prior.result; END IF;
 IF NOT public.qard_rate_limit_check(me,'merchant_payment',10,60) THEN RAISE EXCEPTION 'Demasiados intentos'; END IF;
 PERFORM id FROM public.qard_wallets WHERE id IN (src.wallet_id,dst.wallet_id) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.qard_sub_qr WHERE id IN (src.id,dst.id) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM public.qard_sub_qr WHERE id=src.id; SELECT * INTO dst FROM public.qard_sub_qr WHERE id=dst.id;
 SELECT * INTO sw FROM public.qard_wallets WHERE id=src.wallet_id; SELECT * INTO dw FROM public.qard_wallets WHERE id=dst.wallet_id;
 IF src.estado<>'activa' OR dst.estado<>'activa' OR sw.estado<>'activa' OR dw.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta apagada'; END IF;
 IF src.sub_index>1 AND NOT coalesce(src.curp_verificada,false) THEN RAISE EXCEPTION 'Sub-QR sin activar'; END IF;
 IF src.sub_index=1 AND NOT public.terminal_merchant_valid(me) THEN RAISE EXCEPTION 'Empresarial sin validar'; END IF;
 IF public.qard_dec(src.cvv) IS DISTINCT FROM _cvv THEN RAISE EXCEPTION 'CVV de 3 dígitos incorrecto'; END IF;
 IF src.limite_por_transaccion IS NOT NULL AND _amount>src.limite_por_transaccion THEN RAISE EXCEPTION 'Excede el límite por transacción'; END IF;
 IF src.horario_inicio IS NOT NULL AND src.horario_fin IS NOT NULL AND NOT (CASE WHEN src.horario_inicio<=src.horario_fin THEN (now() AT TIME ZONE 'America/Hermosillo')::time BETWEEN src.horario_inicio AND src.horario_fin ELSE (now() AT TIME ZONE 'America/Hermosillo')::time>=src.horario_inicio OR (now() AT TIME ZONE 'America/Hermosillo')::time<=src.horario_fin END) THEN RAISE EXCEPTION 'Fuera de horario'; END IF;
 a:=CASE WHEN src.sub_index=0 THEN sw.saldo_mxn WHEN src.sub_index=1 THEN sw.saldo_comercio_mxn ELSE src.saldo_mxn END;
 IF a-_amount<(CASE WHEN src.sub_index=0 THEN -50 ELSE 0 END) THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
 IF src.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn-_amount WHERE id=sw.id; ELSIF src.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn-_amount WHERE id=sw.id; ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn-_amount WHERE id=src.id; END IF;
 UPDATE public.qard_wallets SET saldo_comercio_mxn=coalesce(saldo_comercio_mxn,0)+_amount WHERE id=dw.id RETURNING saldo_comercio_mxn INTO dw.saldo_comercio_mxn;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,metadata) VALUES(sw.id,me,src.id,'cobro_comercio',_amount,a-_amount,dst.titular_user_id,jsonb_build_object('bolsa',CASE WHEN src.sub_index=1 THEN 'comercio' ELSE 'personal' END,'operation_key',_key,'flujo','payer_qr')),(dw.id,dst.titular_user_id,NULL,'cobro_recibido',_amount,dw.saldo_comercio_mxn,dst.titular_user_id,jsonb_build_object('bolsa','comercio','operation_key',_key,'flujo','payer_qr'));
 result:=jsonb_build_object('ok',true,'qard_number',_from,'mensaje','Pago confirmado','monto',_amount);
 INSERT INTO public.terminal_operations(merchant_user_id,terminal_code,target_user_id,request_key,amount_mxn,result) VALUES(dst.titular_user_id,'collection',me,_key,_amount,result);
 RETURN result; END $$;
REVOKE ALL ON FUNCTION public.qard_pay_business(text,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_pay_business(text,text,numeric,text,uuid) TO authenticated;
COMMENT ON FUNCTION public.qard_pay_business(text,text,numeric,text,uuid) IS 'Intentional authenticated SECURITY DEFINER entry point: payer owns source, active verified merchant QR, payer CVV3 and locked balances with idempotent receipt; never accepts QR alone.';

-- Accepted invitations remain registered without silently activating or replacing another business.
CREATE OR REPLACE FUNCTION public.terminal_accept_invite(_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); inv public.terminal_invites; phone text; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text,73));
 SELECT telefono INTO phone FROM public.profiles WHERE user_id=me;
 SELECT * INTO inv FROM public.terminal_invites WHERE token=_token FOR UPDATE;
 IF inv.id IS NULL OR inv.status<>'pending' OR NOT public.terminal_phone_matches(inv.phone,phone) THEN RAISE EXCEPTION 'Invitación no disponible para este teléfono'; END IF;
 UPDATE public.terminal_invites SET status='accepted',invited_user_id=me,accepted_at=now(),active=false WHERE id=inv.id;
 INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by,active) VALUES(me,inv.terminal_code,'accepted',inv.merchant_user_id,false) ON CONFLICT(user_id,terminal_code) DO NOTHING;
 END $$;
CREATE OR REPLACE FUNCTION public.terminal_perm_negocio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='accepted' AND NEW.active THEN SELECT negocio_id INTO NEW.negocio_id FROM public.terminal_invites WHERE invited_user_id=NEW.user_id AND terminal_code=NEW.terminal_code AND merchant_user_id=NEW.invited_by AND status='accepted' AND active ORDER BY updated_at DESC LIMIT 1; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.terminal_invite_negocio_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='accepted' AND NEW.active AND NEW.invited_user_id IS NOT NULL THEN UPDATE public.terminal_permissions SET negocio_id=NEW.negocio_id WHERE user_id=NEW.invited_user_id AND terminal_code=NEW.terminal_code AND invited_by=NEW.merchant_user_id AND status='accepted' AND active; END IF;
 RETURN NEW; END $$;