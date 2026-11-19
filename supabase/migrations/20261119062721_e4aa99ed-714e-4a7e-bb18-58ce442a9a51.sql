DO $$
DECLARE w public.qard_wallets; pid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); r jsonb; t text; before_balance numeric; after_balance numeric; BEGIN
 IF has_column_privilege('authenticated','public.qard_bolsillos','saldo_mxn','SELECT') THEN RAISE EXCEPTION 'Pocket balance exposed'; END IF;
 SELECT * INTO w FROM public.qard_wallets WHERE saldo_mxn>=0.01 AND EXISTS(SELECT 1 FROM public.qard_sub_qr s WHERE s.wallet_id=qard_wallets.id AND s.sub_index=0 AND s.estado='activa') AND NOT public.cuenta_esta_bloqueada(titular_user_id) LIMIT 1;
 IF w.id IS NULL THEN RAISE EXCEPTION 'No eligible existing wallet for rollback test'; END IF;
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',w.titular_user_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',w.titular_user_id,'is_anonymous',false)::text,true);
 before_balance:=w.saldo_mxn;
 BEGIN PERFORM public.qard_bolsillo_create(pid,'Renta','12345',0.01); RAISE EXCEPTION 'Invalid PIN accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Invalid PIN accepted' THEN RAISE; END IF; END;
 r:=public.qard_bolsillo_create(pid,'Renta','123456',0.01);
 IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'Creation failed'; END IF;
 SELECT saldo_mxn INTO after_balance FROM public.qard_wallets WHERE id=w.id;
 IF after_balance<>before_balance-0.01 THEN RAISE EXCEPTION 'Deposit debit mismatch'; END IF;
 IF (public.qard_bolsillo_read(pid,'wrong')->>'ok')::boolean THEN RAISE EXCEPTION 'Invalid token accepted'; END IF;
 FOR i IN 1..5 LOOP r:=public.qard_bolsillo_unlock(pid,'9999'); IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'Wrong PIN accepted'; END IF; END LOOP;
 IF (public.qard_bolsillo_unlock(pid,'123456')->>'ok')::boolean THEN RAISE EXCEPTION 'PIN attempt limit bypassed'; END IF;
 UPDATE qard_private.bolsillo_access SET blocked_until=now()-interval '1 second' WHERE bolsillo_id=pid;
 r:=public.qard_bolsillo_unlock(pid,'123456'); t:=r->>'token';
 IF t IS NULL THEN RAISE EXCEPTION 'Unlock failed'; END IF;
 PERFORM public.qard_bolsillo_return(pid,t,0.01,op);
 PERFORM public.qard_bolsillo_return(pid,t,0.01,op);
 SELECT saldo_mxn INTO after_balance FROM public.qard_wallets WHERE id=w.id;
 IF after_balance<>before_balance THEN RAISE EXCEPTION 'Idempotent return mismatch'; END IF;
 IF (SELECT saldo_mxn FROM public.qard_bolsillos WHERE id=pid)<>0 THEN RAISE EXCEPTION 'Pocket not empty'; END IF;
 IF (SELECT count(*) FROM public.qard_movimientos WHERE metadata->>'bolsillo_id'=pid::text)<>2 THEN RAISE EXCEPTION 'Duplicate ledger writes'; END IF;
 IF (SELECT count(*) FROM public.qard_tcb_cadena h JOIN public.qard_movimientos m ON m.id=h.movimiento_id WHERE m.metadata->>'bolsillo_id'=pid::text)<>2 THEN RAISE EXCEPTION 'Missing hashes'; END IF;
 RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='Rollback successful pocket test';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN RAISE NOTICE 'PASS: PIN, lockout, protected balance, one-cent deposit, idempotent Account 00 return, ledger and hashes. All writes rolled back.'; END;
END $$;