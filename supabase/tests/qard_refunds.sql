-- Every fixture operation is rolled back by the enclosing exception block.
DO $$
DECLARE p public.qard_movimientos; req uuid; outp jsonb; before_personal numeric; before_family numeric; before_business numeric; original_count integer; failed boolean; claims text;
BEGIN
 claims:=current_setting('request.jwt.claims',true);
 BEGIN
  FOR p IN SELECT m.* FROM public.qard_movimientos m JOIN public.qard_sub_qr s ON s.id=m.sub_qr_id WHERE m.tipo='cobro_comercio' AND m.metadata ? 'operation_key' AND s.sub_index IN (0,2) AND public.qard_refund_remaining(m.id)>=0.01 ORDER BY s.sub_index,m.created_at DESC LOOP
   SELECT saldo_mxn INTO before_personal FROM public.qard_wallets WHERE id=p.wallet_id;
   SELECT saldo_mxn INTO before_family FROM public.qard_sub_qr WHERE id=p.sub_qr_id;
   SELECT saldo_comercio_mxn INTO before_business FROM public.qard_wallets WHERE titular_user_id=p.comercio_user_id;
   SELECT count(*) INTO original_count FROM public.qard_movimientos WHERE tipo='cobro_recibido';
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.titular_user_id,'role','authenticated','is_anonymous',false)::text,true);
   req:=public.qard_refund_submit(p.id,0.01,'Cobro duplicado',gen_random_uuid());
   IF (SELECT status FROM public.qard_refund_requests WHERE id=req)<>'pending' THEN RAISE EXCEPTION 'Request must be pending'; END IF;
   IF (SELECT saldo_comercio_mxn FROM public.qard_wallets WHERE titular_user_id=p.comercio_user_id)<>before_business THEN RAISE EXCEPTION 'Request moved money'; END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated','is_anonymous',false)::text,true);
   failed:=false; BEGIN PERFORM public.qard_refund_decide(req,true,0.01); EXCEPTION WHEN OTHERS THEN failed:=true; END;
   IF NOT failed THEN RAISE EXCEPTION 'Non-owner authorization accepted'; END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.comercio_user_id,'role','authenticated','is_anonymous',false)::text,true);
   -- Insufficient business balance must not modify request or create refund.
   failed:=false;
   BEGIN
    UPDATE public.qard_wallets SET saldo_comercio_mxn=0 WHERE titular_user_id=p.comercio_user_id;
    PERFORM public.qard_refund_decide(req,true,0.01);
   EXCEPTION WHEN OTHERS THEN failed:=true;
   END;
   IF NOT failed OR (SELECT status FROM public.qard_refund_requests WHERE id=req)<>'pending' THEN RAISE EXCEPTION 'Insufficient funds was not atomic'; END IF;
   outp:=public.qard_refund_decide(req,true,0.01);
   IF outp->>'status'<>'completed' THEN RAISE EXCEPTION 'Refund not completed'; END IF;
   PERFORM public.qard_refund_decide(req,true,0.01);
   IF (SELECT count(*) FROM public.qard_movimientos WHERE metadata->>'refund_request_id'=req::text)<>2 THEN RAISE EXCEPTION 'Retry duplicated money'; END IF;
   IF (SELECT saldo_comercio_mxn FROM public.qard_wallets WHERE titular_user_id=p.comercio_user_id)<>before_business-0.01 THEN RAISE EXCEPTION 'Merchant balance mismatch'; END IF;
   IF (SELECT sub_index FROM public.qard_sub_qr WHERE id=p.sub_qr_id)=0 THEN
    IF (SELECT saldo_mxn FROM public.qard_wallets WHERE id=p.wallet_id)<>before_personal+0.01 THEN RAISE EXCEPTION 'Personal return mismatch'; END IF;
   ELSE
    IF (SELECT saldo_mxn FROM public.qard_sub_qr WHERE id=p.sub_qr_id)<>before_family+0.01 OR (SELECT saldo_mxn FROM public.qard_wallets WHERE id=p.wallet_id)<>before_personal THEN RAISE EXCEPTION 'Family isolation mismatch'; END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM public.qard_movimientos WHERE metadata->>'refund_request_id'=req::text AND (monto_mxn<>-0.01 OR metadata->>'status'<>'completed' OR descripcion NOT LIKE 'Devolución del folio original: QRD-%')) THEN RAISE EXCEPTION 'Immutable reference mismatch'; END IF;
   IF (SELECT count(*) FROM public.qard_movimientos WHERE tipo='cobro_recibido')<>original_count THEN RAISE EXCEPTION 'Gross collections changed'; END IF;
   failed:=false; BEGIN PERFORM public.qard_refund_submit(p.id,abs(p.monto_mxn),'Producto devuelto',gen_random_uuid()); EXCEPTION WHEN OTHERS THEN failed:=true; END;
   IF NOT failed THEN RAISE EXCEPTION 'Cumulative refund cap bypassed'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":true}',true);
  failed:=false; BEGIN PERFORM public.qard_refund_list('eje'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Anonymous account accepted'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='refund checks passed; rollback fixtures';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 PERFORM set_config('request.jwt.claims',coalesce(claims,''),true);
END $$;