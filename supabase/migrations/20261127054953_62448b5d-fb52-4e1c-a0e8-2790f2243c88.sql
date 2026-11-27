-- Reverted integration check: no financial writes, no retained address/document fixtures.
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT titular_user_id FROM public.qard_sub_qr WHERE sub_index=0 ORDER BY created_at LIMIT 1),'role','authenticated','is_anonymous',false)::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT titular_user_id::text FROM public.qard_sub_qr WHERE sub_index=0 ORDER BY created_at LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n text; result jsonb; a jsonb; b jsonb;
BEGIN
 SELECT qard_number INTO n FROM public.qard_sub_qr WHERE titular_user_id=auth.uid() AND sub_index=0;
 IF n IS NULL THEN RAISE EXCEPTION 'A real issued card is required for this check'; END IF;
 result:=public.qard_documento_fuente(n,30,NULL);
 IF result->>'qard'<>n OR result->>'index'<>'0' OR jsonb_typeof(result->'movements')<>'array' OR result->>'balance' IS NULL THEN RAISE EXCEPTION 'Invalid owner snapshot'; END IF;
 BEGIN
  PERFORM public.qard_documento_fuente(left(n,14)||'10',30,NULL);
  RAISE EXCEPTION 'Savings PIN was bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PIN%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.qard_documento_fuente(n,999,NULL);
  RAISE EXCEPTION 'Invalid period accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Periodo inválido%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.qard_domicilio_guardar('0000000000000000','{"calle":"QA","numero":"1","colonia":"QA","cp":"85000","municipio":"QA","estado":"QA"}');
  RAISE EXCEPTION 'Another card accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Tarjeta no encontrada%' THEN RAISE; END IF; END;
 a:=public.qard_domicilio_guardar(n,'{"calle":"QA reversible","numero":"1","colonia":"QA","cp":"85000","municipio":"QA","estado":"QA"}');
 IF a->>'status'<>'pending' OR a->>'progress'<>'0' THEN RAISE EXCEPTION 'Manual address incorrectly verified'; END IF;
 b:=public.qard_domicilio_guardar(n,'{"calle":"QA reversible","numero":"1","colonia":"QA","cp":"85000","municipio":"QA","estado":"QA"}');
 IF b->>'version'<>a->>'version' THEN RAISE EXCEPTION 'Unchanged address reset'; END IF;
 BEGIN
  UPDATE public.qard_domicilios SET progress=3,status='valid' WHERE owner_id=auth.uid();
  RAISE EXCEPTION 'User could grant verification';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.qard_documentos(id,owner_id,source_hash,pdf_hash,period_start,period_end) VALUES(repeat('b',64),auth.uid(),repeat('a',128),repeat('b',64),now(),now());
  RAISE EXCEPTION 'User could forge issuance';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$
DECLARE a public.qard_domicilios; result jsonb; u uuid:=auth.uid(); n text; version integer;
BEGIN
 SELECT * INTO a FROM public.qard_domicilios WHERE owner_id=u AND calle='QA reversible';
 UPDATE public.qard_domicilios SET progress=3,status='valid' WHERE id=a.id;
 INSERT INTO public.qard_documentos(id,owner_id,source_hash,pdf_hash,domicilio_id,domicilio_version,address_verified,period_start,period_end) VALUES(repeat('a',64),u,repeat('b',128),repeat('c',64),a.id,a.version,true,now(),now());
 result:=public.qard_documento_verificar(repeat('a',64));
 IF result->>'address_verified'<>'true' OR result->>'pdf_hash'<>repeat('c',64) THEN RAISE EXCEPTION 'Verification missing'; END IF;
 IF result ?| ARRAY['name','qard_number','qard','owner_id','calle','balance','address'] THEN RAISE EXCEPTION 'Public identity leak'; END IF;
 PERFORM public.qard_domicilio_guardar(a.qard_number,'{"calle":"QA changed","numero":"1","colonia":"QA","cp":"85000","municipio":"QA","estado":"QA"}');
 SELECT progress INTO version FROM public.qard_domicilios WHERE id=a.id;
 IF version<>0 THEN RAISE EXCEPTION 'Address change did not reset progress'; END IF;
 result:=public.qard_documento_verificar(repeat('a',64));
 IF result->>'address_verified'<>'false' THEN RAISE EXCEPTION 'Stale address remains verified'; END IF;
 BEGIN
  UPDATE public.qard_documentos SET pdf_hash=repeat('d',64) WHERE id=repeat('a',64);
  RAISE EXCEPTION 'Document changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Documento inmutable%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.qard_documento_verificar(repeat('a',64));
 IF r->>'found'<>'true' OR r->>'address_verified'<>'false' THEN RAISE EXCEPTION 'Public verification unavailable'; END IF;
 BEGIN PERFORM 1 FROM public.qard_domicilios; RAISE EXCEPTION 'Public address access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.qard_documentos; RAISE EXCEPTION 'Public document access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;