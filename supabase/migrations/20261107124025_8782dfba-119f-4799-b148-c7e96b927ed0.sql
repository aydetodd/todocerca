CREATE OR REPLACE FUNCTION public.qard_collect_atomic(_number text, _amount numeric, _cvv text, _key uuid, _terminal boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me uuid:=auth.uid(); s public.qard_sub_qr; w public.qard_wallets; merchant public.qard_wallets; prior public.terminal_operations; next_balance numeric; current_balance numeric; merchant_id uuid; merchant_name text; result jsonb; business_id uuid; BEGIN
 IF me IS NULL OR NOT _terminal OR NOT public.terminal_has_access(me,'collection') THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 SELECT invited_by,negocio_id INTO merchant_id,business_id FROM public.terminal_permissions WHERE user_id=me AND terminal_code='collection' AND status='accepted' AND active;
 IF _key IS NULL OR _number IS NULL OR _number !~ '^\d{16}$' OR _cvv IS NULL OR _cvv !~ '^\d{3}$' OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Se requiere QaRd, monto y CVV de 3 dígitos del pagador'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(merchant_id::text||_key::text,2));
 SELECT * INTO prior FROM public.terminal_operations WHERE merchant_user_id=merchant_id AND request_key=_key;
 IF FOUND THEN IF prior.terminal_code<>'collection' OR prior.amount_mxn<>_amount OR prior.result->>'qard_number'<>_number OR prior.result->>'operador'<>me::text THEN RAISE EXCEPTION 'Operación utilizada con otros datos'; END IF; RETURN prior.result; END IF;
 IF NOT public.qard_rate_limit_check(me,'merchant_payment',10,60) THEN RAISE EXCEPTION 'Demasiados intentos. Espera un minuto'; END IF;
 SELECT * INTO s FROM public.qard_sub_qr WHERE qard_number=_number;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Tarjeta no encontrada'; END IF;
 IF s.titular_user_id=merchant_id AND s.sub_index=1 THEN RAISE EXCEPTION 'No puedes cobrar con la misma QaRd Empresarial que recibe el dinero'; END IF;
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
 RETURN result; END $function$;