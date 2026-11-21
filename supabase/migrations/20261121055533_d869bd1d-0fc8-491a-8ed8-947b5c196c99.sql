-- Rollback-only checks: one PIN, grouped legacy funds, no repeated concepts, Account 00 return.
DO $$
DECLARE w public.qard_wallets; p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); r jsonb; t text; baseline numeric; rent_before numeric; unused text;
BEGIN
 IF has_column_privilege('authenticated','public.qard_bolsillos','saldo_mxn','SELECT') THEN RAISE EXCEPTION 'Savings balance exposed'; END IF;
 SELECT * INTO w FROM public.qard_wallets WHERE saldo_mxn>=0.01 AND EXISTS(SELECT 1 FROM public.qard_sub_qr s WHERE s.wallet_id=qard_wallets.id AND s.sub_index=0 AND s.estado='activa') AND NOT public.cuenta_esta_bloqueada(titular_user_id) LIMIT 1;
 IF w.id IS NULL THEN RAISE EXCEPTION 'No eligible wallet'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',w.titular_user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',w.titular_user_id,'is_anonymous',false)::text,true);
  baseline:=w.saldo_mxn;
  SELECT coalesce(sum(saldo_mxn),0) INTO rent_before FROM public.qard_bolsillos WHERE titular_user_id=w.titular_user_id AND concepto='Renta';
  INSERT INTO qard_private.ahorro_access(owner_id,pin_hash) VALUES(w.titular_user_id,extensions.crypt('123456',extensions.gen_salt('bf',10))) ON CONFLICT(owner_id) DO UPDATE SET pin_hash=excluded.pin_hash,failures=0,blocked_until=NULL,token_hash=NULL,expires_at=NULL;
  INSERT INTO public.qard_bolsillos(id,titular_user_id,wallet_id,concepto,saldo_mxn) VALUES(p1,w.titular_user_id,w.id,'Renta',0.01),(p2,w.titular_user_id,w.id,'Renta',0.02);
  INSERT INTO qard_private.bolsillo_access(bolsillo_id,pin_hash) VALUES(p1,extensions.crypt('1111',extensions.gen_salt('bf',10))),(p2,extensions.crypt('2222',extensions.gen_salt('bf',10)));
  IF (public.qard_bolsillo_unlock(p1,'1111')->>'ok')::boolean THEN RAISE EXCEPTION 'Individual pocket PIN still accepted'; END IF;
  r:=public.qard_ahorro_unlock('123456'); t:=r->>'token';
  IF t IS NULL THEN RAISE EXCEPTION 'Shared PIN rejected'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(r->'bolsillos') x WHERE x->>'concepto'='Renta')<>1 THEN RAISE EXCEPTION 'Repeated concepts visible'; END IF;
  IF (SELECT (x->>'saldo')::numeric FROM jsonb_array_elements(r->'bolsillos') x WHERE x->>'concepto'='Renta')<>rent_before+0.03 THEN RAISE EXCEPTION 'Grouped funds lost'; END IF;
  IF NOT (public.qard_bolsillo_read(p1,t)->>'ok')::boolean OR NOT (public.qard_bolsillo_read(p2,t)->>'ok')::boolean THEN RAISE EXCEPTION 'One session does not open both pockets'; END IF;
  IF (public.qard_ahorro_read('wrong')->>'ok')::boolean THEN RAISE EXCEPTION 'Invalid token accepted'; END IF;
  BEGIN PERFORM public.qard_ahorro_create(gen_random_uuid(),'Renta',t,0.01); RAISE EXCEPTION 'Duplicate concept accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Duplicate concept accepted' THEN RAISE; END IF; END;
  SELECT c INTO unused FROM unnest(ARRAY['Renta','Útiles','Vacaciones','Emergencias','Salud','Otro']) c WHERE NOT EXISTS(SELECT 1 FROM public.qard_bolsillos b WHERE b.titular_user_id=w.titular_user_id AND b.concepto=c) LIMIT 1;
  IF unused IS NOT NULL THEN
   r:=public.qard_ahorro_create(gen_random_uuid(),unused,t,0.01);
   IF NOT (r->>'ok')::boolean OR (SELECT saldo_mxn FROM public.qard_wallets WHERE id=w.id)<>baseline-0.01 THEN RAISE EXCEPTION 'Deposit from 00 failed'; END IF;
   baseline:=baseline-0.01;
  END IF;
  PERFORM public.qard_ahorro_return('Renta',t,0.03,op);
  PERFORM public.qard_ahorro_return('Renta',t,0.03,op);
  IF (SELECT saldo_mxn FROM public.qard_wallets WHERE id=w.id)<>baseline+0.03 THEN RAISE EXCEPTION 'Account 00 idempotent return failed'; END IF;
  IF (SELECT sum(saldo_mxn) FROM public.qard_bolsillos WHERE titular_user_id=w.titular_user_id AND concepto='Renta')<>rent_before THEN RAISE EXCEPTION 'Grouped return lost funds'; END IF;
  UPDATE qard_private.ahorro_access SET expires_at=now()-interval '1 second' WHERE owner_id=w.titular_user_id;
  IF (public.qard_ahorro_read(t)->>'ok')::boolean THEN RAISE EXCEPTION 'Expired session accepted'; END IF;
  FOR i IN 1..5 LOOP PERFORM public.qard_ahorro_unlock('9999'); END LOOP;
  IF (public.qard_ahorro_unlock('123456')->>'ok')::boolean THEN RAISE EXCEPTION 'Shared lockout bypassed'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='Rollback savings test';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN RAISE NOTICE 'PASS: shared PIN/session, grouped legacy funds, unique concepts, Account 00 deposit/return, idempotency, expiry and lockout. All fixtures rolled back.';
 END;
END $$;