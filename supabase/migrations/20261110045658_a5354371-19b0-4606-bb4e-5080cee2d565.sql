DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('qard_private.qard_refund_list(text,uuid,integer)'::regprocedure);
 body:=replace(body,'(_ambito<>''sub_qr'' OR r.source_sub_qr_id=_sub)','(_ambito<>''sub_qr'' OR _sub IS NULL OR r.source_sub_qr_id=_sub)'); EXECUTE body;
 IF NOT EXISTS(SELECT 1 FROM public.qard_refund_requests GROUP BY payer_movement_id HAVING count(*)>1) THEN CREATE UNIQUE INDEX IF NOT EXISTS qard_refund_one_claim ON public.qard_refund_requests(payer_movement_id); END IF;
END $$;
DO $$
DECLARE p public.qard_movimientos; req uuid; k uuid; admin_id uuid; failed boolean; before_balance numeric; checked integer:=0; original_claims text; fixture uuid; pair jsonb; merchant jsonb; op text;
BEGIN
 original_claims:=current_setting('request.jwt.claims',true);
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 FOR p IN SELECT m.* FROM public.qard_movimientos m WHERE tipo='cobro_comercio' AND metadata ? 'operation_key' AND public.qard_refund_remaining(m.id)>=0.01 AND NOT EXISTS(SELECT 1 FROM public.qard_refund_requests r WHERE r.payer_movement_id=m.id) ORDER BY created_at DESC LIMIT 1 LOOP
  BEGIN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.titular_user_id,'role','authenticated','is_anonymous',false)::text,true);
   pair:=public.qard_refund_pair(p.id); merchant:=pair->'merchant'; fixture:=gen_random_uuid(); op:=gen_random_uuid()::text;
   INSERT INTO public.qard_movimientos(id,wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,metadata,created_at) VALUES(fixture,p.wallet_id,p.titular_user_id,p.sub_qr_id,'cobro_comercio',0.01,p.saldo_despues,p.comercio_user_id,p.metadata||jsonb_build_object('operation_key',op),now()-interval '48 hours');
   INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,metadata,created_at) VALUES((merchant->>'wallet_id')::uuid,(merchant->>'titular_user_id')::uuid,(merchant->>'sub_qr_id')::uuid,'cobro_recibido',0.01,(merchant->>'saldo_despues')::numeric,(merchant->'metadata')||jsonb_build_object('operation_key',op),now()-interval '48 hours');
   k:=gen_random_uuid(); req:=public.qard_refund_submit(fixture,0.01,'Cobro duplicado',k);
   IF public.qard_refund_submit(fixture,0.01,'Cobro duplicado',k)<>req THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
   IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='qard-refund-timeout' AND schedule='0 * * * *') THEN RAISE EXCEPTION 'Hourly schedule failed'; END IF;
   PERFORM public.qard_refund_action(req,'cancel');
   failed:=false; BEGIN PERFORM public.qard_refund_submit(fixture,0.01,'Producto devuelto',gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%reclamación registrada%' THEN RAISE; END IF; failed:=true; END;
   IF NOT failed THEN RAISE EXCEPTION 'Second claim accepted after cancel'; END IF;
   RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback boundary';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN checked:=checked+1;
  END;
  BEGIN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.titular_user_id,'role','authenticated','is_anonymous',false)::text,true);
   pair:=public.qard_refund_pair(p.id); merchant:=pair->'merchant'; fixture:=gen_random_uuid(); op:=gen_random_uuid()::text;
   INSERT INTO public.qard_movimientos(id,wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,metadata,created_at) VALUES(fixture,p.wallet_id,p.titular_user_id,p.sub_qr_id,'cobro_comercio',0.01,p.saldo_despues,p.comercio_user_id,p.metadata||jsonb_build_object('operation_key',op),now()-interval '48 hours'-interval '1 millisecond');
   INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,metadata,created_at) VALUES((merchant->>'wallet_id')::uuid,(merchant->>'titular_user_id')::uuid,(merchant->>'sub_qr_id')::uuid,'cobro_recibido',0.01,(merchant->>'saldo_despues')::numeric,(merchant->'metadata')||jsonb_build_object('operation_key',op),now()-interval '48 hours'-interval '1 millisecond');
   failed:=false; BEGIN PERFORM public.qard_refund_submit(fixture,0.01,'Cobro duplicado',gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Plazo vencido' THEN RAISE; END IF; failed:=true; END;
   IF NOT failed THEN RAISE EXCEPTION 'Late request accepted'; END IF;
   IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin fixture missing'; END IF;
   SELECT saldo_comercio_mxn INTO before_balance FROM public.qard_wallets WHERE titular_user_id=p.comercio_user_id;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','is_anonymous',false)::text,true);
   k:=gen_random_uuid();
   IF public.qard_refund_admin_force(fixture,0.01,'Excepción de prueba revertida',k)->>'status'<>'completed' THEN RAISE EXCEPTION 'Admin exception failed'; END IF;
   PERFORM public.qard_refund_admin_force(fixture,0.01,'Excepción de prueba revertida',k);
   IF (SELECT saldo_comercio_mxn FROM public.qard_wallets WHERE titular_user_id=p.comercio_user_id)<>before_balance-0.01 THEN RAISE EXCEPTION 'Admin retry changed funds'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.qard_refund_override_log l JOIN public.qard_refund_requests r ON r.id=l.request_id WHERE r.request_key=k AND l.actor_id=admin_id AND l.reason='Excepción de prueba revertida') THEN RAISE EXCEPTION 'Audit missing'; END IF;
   RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback admin';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN checked:=checked+1;
  END;
 END LOOP;
 IF checked<>2 THEN RAISE EXCEPTION 'No real payment fixture available'; END IF;
 PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
END $$;