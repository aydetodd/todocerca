-- All financial checks run inside a rolled-back subtransaction.
DO $$
DECLARE l public.qard_bono_lotes; own public.qard_sub_qr; other public.qard_sub_qr; op uuid:=gen_random_uuid(); op2 uuid:=gen_random_uuid(); r jsonb; before_bono numeric; before_other numeric; personal numeric; business numeric; idx int;
BEGIN
 IF has_function_privilege('authenticated','public.qard_bono_entregar(uuid,text,numeric,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Phone delivery still accessible'; END IF;
 SELECT * INTO l FROM public.qard_bono_lotes WHERE saldo_disponible>=0.02 AND EXISTS(SELECT 1 FROM public.qard_sub_qr s WHERE s.titular_user_id=qard_bono_lotes.empresa_user_id AND s.sub_index=0) LIMIT 1;
 IF l.id IS NULL THEN RAISE EXCEPTION 'No eligible lot for rollback test'; END IF;
 SELECT * INTO own FROM public.qard_sub_qr WHERE titular_user_id=l.empresa_user_id AND sub_index=0;
 SELECT * INTO other FROM public.qard_sub_qr WHERE sub_index=0 AND titular_user_id<>l.empresa_user_id LIMIT 1;
 IF other.id IS NULL THEN RAISE EXCEPTION 'No second recipient for rollback test'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',l.empresa_user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',l.empresa_user_id,'is_anonymous',false)::text,true);
  idx:=public.qard_bono_indice(l.categoria);
  SELECT coalesce((SELECT saldo_mxn FROM public.qard_sub_qr WHERE wallet_id=own.wallet_id AND sub_index=idx),0) INTO before_bono;
  SELECT coalesce((SELECT saldo_mxn FROM public.qard_sub_qr WHERE wallet_id=other.wallet_id AND sub_index=idx),0) INTO before_other;
  SELECT saldo_mxn,saldo_comercio_mxn INTO personal,business FROM public.qard_wallets WHERE id=own.wallet_id;
  BEGIN PERFORM public.qard_bono_entregar_qard(l.id,left(own.qard_number,14)||'01',0.01,op); RAISE EXCEPTION 'Non-00 card accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Non-00 card accepted' THEN RAISE; END IF; END;
  BEGIN PERFORM public.qard_bono_entregar_qard(l.id,'6621234567',0.01,op); RAISE EXCEPTION 'Phone accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Phone accepted' THEN RAISE; END IF; END;
  r:=public.qard_bono_entregar_qard(l.id,own.qard_number,0.01,op);
  IF NOT coalesce((r->>'ok')::boolean,false) OR (r->>'terminacion')::int<>idx THEN RAISE EXCEPTION 'Self delivery/category failed'; END IF;
  PERFORM public.qard_bono_entregar_qard(l.id,own.qard_number,0.01,op);
  IF (SELECT saldo_disponible FROM public.qard_bono_lotes WHERE id=l.id)<>l.saldo_disponible-0.01 THEN RAISE EXCEPTION 'Duplicate lot debit'; END IF;
  IF (SELECT saldo_mxn FROM public.qard_sub_qr WHERE wallet_id=own.wallet_id AND sub_index=idx)<>before_bono+0.01 THEN RAISE EXCEPTION 'Wrong voucher credit'; END IF;
  IF (SELECT saldo_mxn FROM public.qard_wallets WHERE id=own.wallet_id) IS DISTINCT FROM personal OR (SELECT saldo_comercio_mxn FROM public.qard_wallets WHERE id=own.wallet_id) IS DISTINCT FROM business THEN RAISE EXCEPTION 'General funds changed'; END IF;
  BEGIN PERFORM public.qard_bono_entregar_qard(l.id,other.qard_number,0.01,op); RAISE EXCEPTION 'Recipient idempotency mismatch accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Recipient idempotency mismatch accepted' THEN RAISE; END IF; END;
  BEGIN PERFORM public.qard_bono_entregar_qard(l.id,other.qard_number,l.saldo_disponible+1,op2); RAISE EXCEPTION 'Insufficient lot accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Insufficient lot accepted' THEN RAISE; END IF; END;
  r:=public.qard_bono_entregar_qard(l.id,other.qard_number,0.01,op2);
  IF NOT coalesce((r->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Employee delivery failed'; END IF;
  IF (SELECT saldo_mxn FROM public.qard_sub_qr WHERE wallet_id=other.wallet_id AND sub_index=idx)<>before_other+0.01 THEN RAISE EXCEPTION 'Employee category credit failed'; END IF;
  IF (SELECT count(*) FROM public.qard_bono_entregas WHERE operation_key IN (op,op2))<>2 THEN RAISE EXCEPTION 'Receipt mismatch'; END IF;
  IF (SELECT count(*) FROM public.qard_movimientos WHERE metadata->>'operation_key' IN (op::text,op2::text) AND tipo='bono_recibido')<>2 THEN RAISE EXCEPTION 'Ledger mismatch'; END IF;
  IF (SELECT count(*) FROM public.qard_tcb_cadena h JOIN public.qard_movimientos m ON m.id=h.movimiento_id WHERE m.metadata->>'operation_key' IN (op::text,op2::text))<>2 THEN RAISE EXCEPTION 'Hash mismatch'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other.titular_user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other.titular_user_id,'is_anonymous',false)::text,true);
  BEGIN PERFORM public.qard_bono_entregar_qard(l.id,other.qard_number,0.01,gen_random_uuid()); RAISE EXCEPTION 'Non-owner accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Non-owner accepted' THEN RAISE; END IF; END;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='Rollback QaRd delivery checks';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN RAISE NOTICE 'PASS: Personal 00 lookup, own/employee voucher credits, unchanged general funds, lot ownership/limits, recipient-bound idempotency, receipts and hashes; all writes rolled back.';
 END;
END $$;