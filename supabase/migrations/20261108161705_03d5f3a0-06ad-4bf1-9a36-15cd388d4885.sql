CREATE TABLE public.qard_refund_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL UNIQUE,
 payer_user_id uuid NOT NULL, merchant_user_id uuid NOT NULL,
 payer_movement_id uuid NOT NULL, merchant_movement_id uuid NOT NULL,
 source_sub_qr_id uuid NOT NULL, source_ambito text NOT NULL,
 original_folio text NOT NULL, requested_amount numeric(14,2) NOT NULL,
 approved_amount numeric(14,2), reason text NOT NULL, decision_reason text,
 status text NOT NULL DEFAULT 'pending', initiated_by uuid NOT NULL,
 payer_refund_id uuid, merchant_refund_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
GRANT SELECT ON public.qard_refund_requests TO authenticated;
GRANT ALL ON public.qard_refund_requests TO service_role;
ALTER TABLE public.qard_refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_participants_read ON public.qard_refund_requests FOR SELECT TO authenticated USING(auth.uid() IN (payer_user_id,merchant_user_id));
CREATE INDEX qard_refund_payer ON public.qard_refund_requests(payer_user_id,created_at DESC);
CREATE INDEX qard_refund_merchant ON public.qard_refund_requests(merchant_user_id,created_at DESC);
CREATE INDEX qard_refund_original ON public.qard_refund_requests(payer_movement_id,status);
CREATE TRIGGER qard_refund_updated BEFORE UPDATE ON public.qard_refund_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_refund_requests;

CREATE FUNCTION public.qard_refund_original(_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT to_jsonb(m) FROM public.qard_movimientos m WHERE id=_id),(SELECT data FROM public.qard_movimientos_archivo WHERE movimiento_id=_id))
$$;
REVOKE ALL ON FUNCTION public.qard_refund_original(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qard_refund_original(uuid) TO service_role;

CREATE FUNCTION public.qard_refund_pair(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb; payer jsonb; merchant jsonb; k text; c integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 m:=public.qard_refund_original(_id);
 IF m IS NULL OR m->>'titular_user_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Este cobro no pertenece a tu cuenta'; END IF;
 k:=m->'metadata'->>'operation_key';
 IF k IS NULL OR m->>'tipo' NOT IN ('cobro_comercio','cobro_recibido') OR NOT(coalesce(m->'metadata'->>'terminal','')='collection' OR coalesce(m->'metadata'->>'flujo','')='payer_qr') THEN RAISE EXCEPTION 'Este movimiento no es un pago de comercio con devolución disponible'; END IF;
 WITH originals AS (SELECT to_jsonb(x) d FROM public.qard_movimientos x WHERE metadata->>'operation_key'=k AND tipo IN ('cobro_comercio','cobro_recibido') UNION ALL SELECT a.data FROM public.qard_movimientos_archivo a WHERE a.data->'metadata'->>'operation_key'=k AND a.data->>'tipo' IN ('cobro_comercio','cobro_recibido') AND NOT EXISTS(SELECT 1 FROM public.qard_movimientos x WHERE x.id=a.movimiento_id))
 SELECT count(*), (jsonb_agg(d) FILTER(WHERE d->>'tipo'='cobro_comercio'))->0, (jsonb_agg(d) FILTER(WHERE d->>'tipo'='cobro_recibido'))->0 INTO c,payer,merchant FROM originals;
 IF c<>2 OR payer IS NULL OR merchant IS NULL OR payer->>'comercio_user_id' IS DISTINCT FROM merchant->>'titular_user_id' OR payer->>'monto_mxn' IS DISTINCT FROM merchant->>'monto_mxn' OR payer->>'sub_qr_id' IS NULL OR (payer->>'monto_mxn')::numeric<=0 THEN RAISE EXCEPTION 'No se pudo cotejar el cobro original; no se devolverán fondos'; END IF;
 RETURN jsonb_build_object('payer',payer,'merchant',merchant);
END $$;
REVOKE ALL ON FUNCTION public.qard_refund_pair(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qard_refund_pair(uuid) TO service_role;

CREATE FUNCTION public.qard_refund_remaining(_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT abs((public.qard_refund_original(_id)->>'monto_mxn')::numeric)-coalesce((SELECT sum(abs(monto_mxn)) FROM public.qard_movimientos WHERE tipo='devolucion' AND metadata->>'original_movimiento_id'=_id::text),0)-coalesce((SELECT sum(abs((a.data->>'monto_mxn')::numeric)) FROM public.qard_movimientos_archivo a WHERE a.data->>'tipo'='devolucion' AND a.data->'metadata'->>'original_movimiento_id'=_id::text AND NOT EXISTS(SELECT 1 FROM public.qard_movimientos m WHERE m.id=a.movimiento_id)),0)
$$;
REVOKE ALL ON FUNCTION public.qard_refund_remaining(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qard_refund_remaining(uuid) TO service_role;

CREATE FUNCTION public.qard_refund_context(_movement uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pair jsonb; p jsonb; m jsonb; remain numeric; folio text;
BEGIN
 pair:=public.qard_refund_pair(_movement); p:=pair->'payer'; m:=pair->'merchant';
 remain:=least(public.qard_refund_remaining((p->>'id')::uuid),public.qard_refund_remaining((m->>'id')::uuid));
 folio:='QRD-'||to_char((p->>'created_at')::timestamptz AT TIME ZONE 'America/Hermosillo','YYYYMMDD')||'-'||upper(left(replace(p->'metadata'->>'operation_key','-',''),6));
 RETURN jsonb_build_object('original_folio',folio,'original_amount',(p->>'monto_mxn')::numeric,'remaining',remain,'can_authorize',auth.uid()::text=m->>'titular_user_id','source_ambito',p->>'ambito','requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.qard_refund_requests r WHERE r.payer_movement_id=(p->>'id')::uuid),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.qard_refund_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_context(uuid) TO authenticated,service_role;

CREATE FUNCTION public.qard_refund_submit(_movement uuid,_amount numeric,_reason text,_key uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pair jsonb; p jsonb; m jsonb; r public.qard_refund_requests; remain numeric; folio text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _key IS NULL OR _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Indica un monto válido y un motivo de 3 a 500 caracteres'; END IF;
 pair:=public.qard_refund_pair(_movement); p:=pair->'payer'; m:=pair->'merchant';
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,482));
 SELECT * INTO r FROM public.qard_refund_requests WHERE request_key=_key;
 IF FOUND THEN IF r.initiated_by<>auth.uid() OR r.payer_movement_id<>(p->>'id')::uuid OR r.requested_amount<>_amount OR r.reason<>btrim(_reason) THEN RAISE EXCEPTION 'Solicitud utilizada con otros datos'; END IF; RETURN r.id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'id',481));
 remain:=least(public.qard_refund_remaining((p->>'id')::uuid),public.qard_refund_remaining((m->>'id')::uuid));
 IF _amount>remain THEN RAISE EXCEPTION 'La devolución supera el importe original pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=(p->>'id')::uuid AND status='pending') THEN RAISE EXCEPTION 'Ya existe una solicitud pendiente para este cobro'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE id=(p->>'sub_qr_id')::uuid AND wallet_id=(p->>'wallet_id')::uuid AND titular_user_id=(p->>'titular_user_id')::uuid) THEN RAISE EXCEPTION 'La tarjeta original ya no está disponible'; END IF;
 folio:='QRD-'||to_char((p->>'created_at')::timestamptz AT TIME ZONE 'America/Hermosillo','YYYYMMDD')||'-'||upper(left(replace(p->'metadata'->>'operation_key','-',''),6));
 INSERT INTO public.qard_refund_requests(request_key,payer_user_id,merchant_user_id,payer_movement_id,merchant_movement_id,source_sub_qr_id,source_ambito,original_folio,requested_amount,reason,initiated_by) VALUES(_key,(p->>'titular_user_id')::uuid,(m->>'titular_user_id')::uuid,(p->>'id')::uuid,(m->>'id')::uuid,(p->>'sub_qr_id')::uuid,p->>'ambito',folio,_amount,btrim(_reason),auth.uid()) RETURNING id INTO r.id;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.qard_refund_submit(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_submit(uuid,numeric,text,uuid) TO authenticated,service_role;

CREATE FUNCTION public.qard_refund_decide(_request uuid,_approve boolean,_amount numeric DEFAULT NULL,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.qard_refund_requests; p jsonb; m jsonb; src public.qard_sub_qr; mw public.qard_wallets; pw public.qard_wallets; remain numeric; p_balance numeric; m_balance numeric; p_ref uuid; m_ref uuid; md jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request;
 IF r.id IS NULL OR r.merchant_user_id<>auth.uid() THEN RAISE EXCEPTION 'Solo el dueño del negocio puede autorizar o rechazar'; END IF;
 IF _approve IS NULL THEN RAISE EXCEPTION 'Indica tu decisión'; END IF;
 p:=public.qard_refund_original(r.payer_movement_id); m:=public.qard_refund_original(r.merchant_movement_id);
 -- Lock the original before the request in every path; serialize partial refunds.
 PERFORM pg_advisory_xact_lock(hashtextextended(r.payer_movement_id::text,481));
 PERFORM pg_advisory_xact_lock(hashtextextended(r.merchant_movement_id::text,481));
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request FOR UPDATE;
 IF r.status='completed' THEN IF NOT _approve OR r.approved_amount IS DISTINCT FROM _amount THEN RAISE EXCEPTION 'Esta devolución ya fue completada con otra decisión'; END IF; RETURN jsonb_build_object('status','completed','amount',r.approved_amount,'original_folio',r.original_folio); END IF;
 IF r.status='rejected' THEN IF _approve THEN RAISE EXCEPTION 'Esta solicitud fue rechazada'; END IF; RETURN jsonb_build_object('status','rejected'); END IF;
 IF NOT _approve THEN
  IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Explica por qué se rechaza la solicitud'; END IF;
  UPDATE public.qard_refund_requests SET status='rejected',decision_reason=btrim(_reason),decided_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('status','rejected');
 END IF;
 IF _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR _amount>r.requested_amount THEN RAISE EXCEPTION 'El monto autorizado debe ser positivo y no superar lo solicitado'; END IF;
 IF _amount<r.requested_amount AND length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Explica el motivo de la devolución parcial'; END IF;
 IF p IS NULL OR m IS NULL THEN RAISE EXCEPTION 'No se encontró el cobro original'; END IF;
 remain:=least(public.qard_refund_remaining(r.payer_movement_id),public.qard_refund_remaining(r.merchant_movement_id));
 IF _amount>remain THEN RAISE EXCEPTION 'La devolución supera el importe original pendiente'; END IF;
 IF public.cuenta_esta_bloqueada(r.merchant_user_id) OR public.cuenta_esta_bloqueada(r.payer_user_id) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 PERFORM id FROM public.qard_wallets WHERE id IN ((p->>'wallet_id')::uuid,(m->>'wallet_id')::uuid) ORDER BY id FOR UPDATE;
 SELECT * INTO mw FROM public.qard_wallets WHERE id=(m->>'wallet_id')::uuid;
 SELECT * INTO pw FROM public.qard_wallets WHERE id=(p->>'wallet_id')::uuid;
 IF mw.id IS NULL OR pw.id IS NULL THEN RAISE EXCEPTION 'Cuenta original no disponible'; END IF;
 -- Wallet updates mirror the enterprise card; lock source after wallets, matching payments.
 SELECT * INTO src FROM public.qard_sub_qr WHERE id=r.source_sub_qr_id FOR UPDATE;
 IF src.id IS NULL OR src.wallet_id<>pw.id OR src.titular_user_id<>r.payer_user_id OR (CASE WHEN src.sub_index=0 THEN 'eje' WHEN src.sub_index=1 THEN 'cobros' ELSE 'sub_qr' END)<>r.source_ambito THEN RAISE EXCEPTION 'La tarjeta original no corresponde al pago'; END IF;
 IF coalesce(mw.saldo_comercio_mxn,0)<_amount THEN RAISE EXCEPTION 'Saldo Empresarial insuficiente; la solicitud sigue pendiente'; END IF;
 UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn-_amount WHERE id=mw.id RETURNING saldo_comercio_mxn INTO m_balance;
 IF src.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn+_amount WHERE id=pw.id RETURNING saldo_mxn INTO p_balance;
 ELSIF src.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn+_amount WHERE id=pw.id RETURNING saldo_comercio_mxn INTO p_balance;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn+_amount WHERE id=src.id RETURNING saldo_mxn INTO p_balance; END IF;
 md:=jsonb_build_object('operation_key',r.request_key,'refund_request_id',r.id,'reason',r.reason,'decision_reason',nullif(btrim(_reason),''),'status','completed');
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,metadata) VALUES(mw.id,r.merchant_user_id,(m->>'sub_qr_id')::uuid,'devolucion',-_amount,m_balance,r.merchant_user_id,m->>'comercio_nombre',md||jsonb_build_object('original_movimiento_id',r.merchant_movement_id,'bolsa','comercio','sucursal_nombre',m->'metadata'->>'sucursal_nombre','terminal_nombre',m->'metadata'->>'terminal_nombre','negocio_id',m->'metadata'->>'negocio_id','terminal_id',m->'metadata'->>'terminal_id')) RETURNING id INTO m_ref;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,comercio_nombre,metadata) VALUES(pw.id,r.payer_user_id,src.id,'devolucion',-_amount,p_balance,r.merchant_user_id,p->>'comercio_nombre',md||jsonb_build_object('original_movimiento_id',r.payer_movement_id,'bolsa',CASE WHEN src.sub_index=1 THEN 'comercio' ELSE 'personal' END,'sucursal_nombre',m->'metadata'->>'sucursal_nombre','terminal_nombre',m->'metadata'->>'terminal_nombre')) RETURNING id INTO p_ref;
 UPDATE public.qard_refund_requests SET status='completed',approved_amount=_amount,decision_reason=nullif(btrim(_reason),''),payer_refund_id=p_ref,merchant_refund_id=m_ref,decided_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('status','completed','amount',_amount,'original_folio',r.original_folio);
END $$;
REVOKE ALL ON FUNCTION public.qard_refund_decide(uuid,boolean,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_decide(uuid,boolean,numeric,text) TO authenticated,service_role;

CREATE FUNCTION public.qard_refund_list(_ambito text,_sub uuid DEFAULT NULL,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _offset IS NULL OR _offset<0 OR _ambito IS NULL OR _ambito NOT IN ('eje','cobros','sub_qr') THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT r.*,auth.uid()=r.merchant_user_id AS can_authorize FROM public.qard_refund_requests r WHERE (r.merchant_user_id=auth.uid() AND _ambito='cobros') OR (r.payer_user_id=auth.uid() AND r.source_ambito=_ambito AND (_ambito<>'sub_qr' OR r.source_sub_qr_id=_sub)) ORDER BY r.created_at DESC,r.id LIMIT 100 OFFSET _offset) x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.qard_refund_list(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_list(text,uuid,integer) TO authenticated,service_role;