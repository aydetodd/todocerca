ALTER TABLE public.qard_refund_requests ADD COLUMN override_by uuid, ADD COLUMN override_reason text;
CREATE TABLE public.qard_refund_override_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE REFERENCES public.qard_refund_requests(id), actor_id uuid NOT NULL, original_folio text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.qard_refund_override_log TO authenticated;
GRANT ALL ON public.qard_refund_override_log TO service_role;
ALTER TABLE public.qard_refund_override_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_override_admin_read ON public.qard_refund_override_log FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
CREATE OR REPLACE FUNCTION qard_private.refund_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original jsonb;
BEGIN
 IF NEW.status NOT IN ('pending','completed','rejected','timed_out','cancelled','disputed','resolving','dispute_rejected') THEN RAISE EXCEPTION 'Estado de devolución inválido'; END IF;
 IF TG_OP='UPDATE' AND (NEW.override_by IS DISTINCT FROM OLD.override_by OR NEW.override_reason IS DISTINCT FROM OLD.override_reason) THEN RAISE EXCEPTION 'El registro de excepción es inmutable'; END IF;
 IF TG_OP='INSERT' OR (NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.payer_movement_id::text,481));
  IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=NEW.payer_movement_id AND status='disputed' AND id<>NEW.id) THEN RAISE EXCEPTION 'Cobro congelado por disputa activa'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=NEW.payer_movement_id) THEN RAISE EXCEPTION 'Este cobro ya tiene una reclamación registrada'; END IF;
  original:=public.qard_refund_original(NEW.payer_movement_id);
  IF original IS NULL OR original->>'created_at' IS NULL THEN RAISE EXCEPTION 'Cobro original no disponible'; END IF;
  IF NEW.override_by IS NOT NULL THEN
   IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) OR NEW.override_by<>auth.uid() OR NOT public.has_role(auth.uid(),'admin') OR length(btrim(coalesce(NEW.override_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Solo admin puede forzar una devolución con motivo'; END IF;
  ELSIF now()>(original->>'created_at')::timestamptz+interval '48 hours' THEN RAISE EXCEPTION 'Plazo vencido'; END IF;
  NEW.created_at:=now(); NEW.expires_at:=NEW.created_at+interval '72 hours';
  PERFORM pg_advisory_xact_lock(73819001);
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='qard-refund-timeout') THEN PERFORM cron.schedule('qard-refund-timeout','0 * * * *','SELECT qard_private.qard_refund_expire()'); END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.qard_refund_pair(uuid)'::regprocedure);
 body:=replace(body,'m->>''titular_user_id'' IS DISTINCT FROM auth.uid()::text','(m->>''titular_user_id'' IS DISTINCT FROM auth.uid()::text AND NOT public.has_role(auth.uid(),''admin''))');
 EXECUTE body;
END $$;
CREATE FUNCTION qard_private.qard_refund_create(_movement uuid,_amount numeric,_reason text,_key uuid,_override_reason text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pair jsonb; p jsonb; m jsonb; r public.qard_refund_requests; remain numeric; folio text;
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión con tu cuenta'; END IF;
 IF _override_reason IS NOT NULL AND (NOT public.has_role(auth.uid(),'admin') OR length(btrim(_override_reason)) NOT BETWEEN 3 AND 500) THEN RAISE EXCEPTION 'Solo admin puede forzar una devolución con motivo'; END IF;
 IF _key IS NULL OR _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<=0 OR _amount<>round(_amount,2) OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Indica un monto válido y un motivo de 3 a 500 caracteres'; END IF;
 pair:=public.qard_refund_pair(_movement); p:=pair->'payer'; m:=pair->'merchant';
 IF _override_reason IS NULL AND auth.uid()::text NOT IN(p->>'titular_user_id',m->>'titular_user_id') THEN RAISE EXCEPTION 'Este cobro no pertenece a tu cuenta'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,482));
 SELECT * INTO r FROM public.qard_refund_requests WHERE request_key=_key;
 IF FOUND THEN
  IF r.initiated_by<>auth.uid() OR r.payer_movement_id<>(p->>'id')::uuid OR r.requested_amount<>_amount OR r.reason<>btrim(_reason) OR r.override_reason IS DISTINCT FROM nullif(btrim(_override_reason),'') THEN RAISE EXCEPTION 'Solicitud utilizada con otros datos'; END IF;
  RETURN r.id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'id',481));
 IF _override_reason IS NULL AND now()>(p->>'created_at')::timestamptz+interval '48 hours' THEN RAISE EXCEPTION 'Plazo vencido'; END IF;
 IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=(p->>'id')::uuid) THEN RAISE EXCEPTION 'Este cobro ya tiene una reclamación registrada'; END IF;
 remain:=least(public.qard_refund_remaining((p->>'id')::uuid),public.qard_refund_remaining((m->>'id')::uuid));
 IF _amount>remain THEN RAISE EXCEPTION 'La devolución supera el importe original pendiente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE id=(p->>'sub_qr_id')::uuid AND wallet_id=(p->>'wallet_id')::uuid AND titular_user_id=(p->>'titular_user_id')::uuid) THEN RAISE EXCEPTION 'La tarjeta original ya no está disponible'; END IF;
 folio:='QRD-'||to_char((p->>'created_at')::timestamptz AT TIME ZONE 'America/Hermosillo','YYYYMMDD')||'-'||upper(left(replace(p->'metadata'->>'operation_key','-',''),6));
 INSERT INTO public.qard_refund_requests(request_key,payer_user_id,merchant_user_id,payer_movement_id,merchant_movement_id,source_sub_qr_id,source_ambito,original_folio,requested_amount,reason,initiated_by,override_by,override_reason) VALUES(_key,(p->>'titular_user_id')::uuid,(m->>'titular_user_id')::uuid,(p->>'id')::uuid,(m->>'id')::uuid,(p->>'sub_qr_id')::uuid,p->>'ambito',folio,_amount,btrim(_reason),auth.uid(),CASE WHEN _override_reason IS NOT NULL THEN auth.uid() END,nullif(btrim(_override_reason),'')) RETURNING * INTO r;
 IF _override_reason IS NOT NULL THEN INSERT INTO public.qard_refund_override_log(request_id,actor_id,original_folio,reason) VALUES(r.id,auth.uid(),folio,btrim(_override_reason)); END IF;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_create(uuid,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION qard_private.qard_refund_submit(_movement uuid,_amount numeric,_reason text,_key uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT qard_private.qard_refund_create(_movement,_amount,_reason,_key,NULL) $$;
CREATE FUNCTION qard_private.qard_refund_admin_force(_movement uuid,_amount numeric,_reason text,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE req uuid; r public.qard_refund_requests;
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo admin puede forzar una devolución'; END IF;
 req:=qard_private.qard_refund_create(_movement,_amount,_reason,_key,_reason);
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=req FOR UPDATE;
 IF r.status='completed' THEN RETURN jsonb_build_object('status','completed','amount',r.approved_amount); END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'La reclamación ya fue decidida'; END IF;
 UPDATE public.qard_refund_requests SET status='resolving',resolved_by=auth.uid() WHERE id=req;
 RETURN qard_private.qard_refund_settle(req,true,_amount,_reason);
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_admin_force(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_admin_force(uuid,numeric,text,uuid) TO authenticated,service_role;
CREATE FUNCTION public.qard_refund_admin_force(_movement uuid,_amount numeric,_reason text,_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_refund_admin_force(_movement,_amount,_reason,_key) $$;
REVOKE ALL ON FUNCTION public.qard_refund_admin_force(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_admin_force(uuid,numeric,text,uuid) TO authenticated,service_role;
CREATE FUNCTION qard_private.qard_refund_payments(_folio text DEFAULT NULL,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _offset<0 OR _offset>100000 OR (_folio IS NOT NULL AND _folio !~* '^QRD-[0-9]{8}-[A-Z0-9]{6}$') THEN RAISE EXCEPTION 'Folio inválido'; END IF;
 RETURN coalesce((WITH originals AS (
 SELECT to_jsonb(m) d FROM public.qard_movimientos m WHERE tipo='cobro_comercio' AND (titular_user_id=auth.uid() OR (_folio IS NOT NULL AND public.has_role(auth.uid(),'admin'))) AND (_folio IS NOT NULL OR created_at>=now()-interval '30 days')
 UNION ALL SELECT a.data FROM public.qard_movimientos_archivo a WHERE a.data->>'tipo'='cobro_comercio' AND (a.data->>'titular_user_id'=auth.uid()::text OR (_folio IS NOT NULL AND public.has_role(auth.uid(),'admin'))) AND (_folio IS NOT NULL OR (a.data->>'created_at')::timestamptz>=now()-interval '30 days') AND NOT EXISTS(SELECT 1 FROM public.qard_movimientos m WHERE m.id=a.movimiento_id)
 ), payments AS (SELECT d,'QRD-'||to_char((d->>'created_at')::timestamptz AT TIME ZONE 'America/Hermosillo','YYYYMMDD')||'-'||upper(left(replace(d->'metadata'->>'operation_key','-',''),6)) folio FROM originals WHERE d->'metadata'->>'operation_key' IS NOT NULL AND (d->'metadata'->>'terminal'='collection' OR d->'metadata'->>'flujo'='payer_qr'))
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.movement_id) FROM (SELECT (d->>'id')::uuid movement_id,folio original_folio,(d->>'monto_mxn')::numeric amount,(d->>'created_at')::timestamptz created_at,d->>'ambito' source_ambito,d->>'sub_qr_id' source_sub_qr_id FROM payments WHERE _folio IS NULL OR folio=upper(_folio) ORDER BY (d->>'created_at')::timestamptz DESC,d->>'id' LIMIT 100 OFFSET _offset)x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_payments(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_payments(text,integer) TO authenticated,service_role;
CREATE FUNCTION public.qard_refund_payments(_folio text DEFAULT NULL,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_refund_payments(_folio,_offset) $$;
REVOKE ALL ON FUNCTION public.qard_refund_payments(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_payments(text,integer) TO authenticated,service_role;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('qard_private.qard_refund_context(uuid)'::regprocedure);
 body:=replace(body,'''original_amount'',','''original_created_at'',p->>''created_at'',''request_deadline'',(p->>''created_at'')::timestamptz+interval ''48 hours'',''original_amount'',');
 EXECUTE body;
END $$;
CREATE OR REPLACE FUNCTION qard_private.qard_refund_expire() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN
  PERFORM pg_advisory_xact_lock(73819001);
  IF NOT EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='qard-refund-timeout'; RETURN 0; END IF;
 END IF;
 FOR r IN SELECT id,payer_movement_id,merchant_movement_id FROM public.qard_refund_requests WHERE status='pending' AND expires_at<=now() ORDER BY payer_movement_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(r.payer_movement_id::text,481));
  PERFORM pg_advisory_xact_lock(hashtextextended(r.merchant_movement_id::text,481));
  UPDATE public.qard_refund_requests SET status='timed_out',decision_reason='Sin respuesta en 72 horas',decided_at=now() WHERE id=r.id AND status='pending' AND expires_at<=now();
  IF FOUND THEN n:=n+1; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(73819001);
 IF NOT EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='qard-refund-timeout'; END IF;
 RETURN n;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN
  PERFORM cron.schedule('qard-refund-timeout','0 * * * *','SELECT qard_private.qard_refund_expire()');
 ELSE PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='qard-refund-timeout'; END IF;
END $$;