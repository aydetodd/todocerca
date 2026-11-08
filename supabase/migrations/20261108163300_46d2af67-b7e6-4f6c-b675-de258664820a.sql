-- lovable-cron-fallback-reviewed: 72-hour notification deadline, wake on pending insert and unschedule after drain; maximum one-minute delay.
ALTER TABLE public.qard_refund_requests ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now()+interval '72 hours'), ADD COLUMN dispute_reason text, ADD COLUMN disputed_at timestamptz, ADD COLUMN resolved_by uuid;
UPDATE public.qard_refund_requests SET expires_at=created_at+interval '72 hours';
CREATE TABLE public.qard_refund_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES public.qard_refund_requests(id),recipient_id uuid NOT NULL,event text NOT NULL,message text NOT NULL,whatsapp_status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,provider_id text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(request_id,recipient_id,event));
GRANT SELECT ON public.qard_refund_notifications TO authenticated;
GRANT ALL ON public.qard_refund_notifications TO service_role;
ALTER TABLE public.qard_refund_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_notice_recipient ON public.qard_refund_notifications FOR SELECT TO authenticated USING(auth.uid()=recipient_id AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
CREATE TRIGGER refund_notice_updated BEFORE UPDATE ON public.qard_refund_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER POLICY refund_participants_read ON public.qard_refund_requests USING(auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) AND (auth.uid() IN(payer_user_id,merchant_user_id) OR public.has_role(auth.uid(),'admin')));
CREATE FUNCTION qard_private.refund_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient uuid; body text; ev text; recipients uuid[];
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
 ev:=NEW.status;
 IF ev NOT IN ('pending','completed','rejected','timed_out','cancelled','disputed','dispute_rejected') THEN RETURN NEW; END IF;
 body:='Devolución '||NEW.original_folio||': '||CASE ev WHEN 'pending' THEN 'Solicitud recibida. Responde antes de 72 horas.' WHEN 'completed' THEN 'Completada por $'||NEW.approved_amount||'.' WHEN 'rejected' THEN 'Rechazada: '||coalesce(NEW.decision_reason,'')||'. Puedes abrir una disputa.' WHEN 'timed_out' THEN 'Rechazada por timeout (72 horas). Puedes abrir una disputa.' WHEN 'cancelled' THEN 'Cancelada por el cliente.' WHEN 'disputed' THEN 'Disputa abierta. Importe retenido hasta revisión de TodoCerca.' ELSE 'Disputa resuelta sin devolución: '||coalesce(NEW.decision_reason,'') END||' https://todocerca.mx/qard';
 recipients:=CASE WHEN ev='pending' THEN ARRAY[NEW.merchant_user_id] WHEN ev='cancelled' THEN ARRAY[NEW.merchant_user_id] ELSE ARRAY[NEW.payer_user_id,NEW.merchant_user_id] END;
 IF ev='disputed' THEN recipients:=recipients||coalesce((SELECT array_agg(user_id) FROM public.user_roles WHERE role='admin'),'{}'::uuid[]); END IF;
 FOR recipient IN SELECT DISTINCT unnest(recipients) LOOP
  INSERT INTO public.qard_refund_notifications(request_id,recipient_id,event,message) VALUES(NEW.id,recipient,ev,body) ON CONFLICT DO NOTHING;
  IF FOUND THEN INSERT INTO public.messages(sender_id,receiver_id,message) VALUES('00000000-0000-0000-0000-000000000001',recipient,body); END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qard_private.refund_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refund_lifecycle_notice AFTER INSERT OR UPDATE ON public.qard_refund_requests FOR EACH ROW EXECUTE FUNCTION qard_private.refund_event();
CREATE FUNCTION qard_private.refund_hold_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE held numeric;
BEGIN
 IF NEW.saldo_comercio_mxn<OLD.saldo_comercio_mxn THEN
  SELECT coalesce(sum(requested_amount),0) INTO held FROM public.qard_refund_requests WHERE merchant_user_id=OLD.titular_user_id AND status='disputed';
  IF NEW.saldo_comercio_mxn<held THEN RAISE EXCEPTION 'Saldo retenido por disputas: $%',held; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qard_private.refund_hold_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refund_held_funds BEFORE UPDATE OF saldo_comercio_mxn ON public.qard_wallets FOR EACH ROW EXECUTE FUNCTION qard_private.refund_hold_guard();
CREATE FUNCTION qard_private.refund_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status NOT IN ('pending','completed','rejected','timed_out','cancelled','disputed','resolving','dispute_rejected') THEN RAISE EXCEPTION 'Estado de devolución inválido'; END IF;
 IF TG_OP='INSERT' OR (NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.payer_movement_id::text,481));
  IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=NEW.payer_movement_id AND status='disputed' AND id<>NEW.id) THEN RAISE EXCEPTION 'Cobro congelado por disputa activa'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.expires_at:=NEW.created_at+interval '72 hours';
  PERFORM pg_advisory_xact_lock(73819001);
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='qard-refund-timeout') THEN
   PERFORM cron.schedule('qard-refund-timeout','* * * * *','SELECT qard_private.qard_refund_expire()');
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qard_private.refund_request_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refund_request_rules BEFORE INSERT OR UPDATE ON public.qard_refund_requests FOR EACH ROW EXECUTE FUNCTION qard_private.refund_request_guard();
CREATE FUNCTION qard_private.qard_refund_expire() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer:=0;
BEGIN
 FOR r IN SELECT id,payer_movement_id,merchant_movement_id FROM public.qard_refund_requests WHERE status='pending' AND expires_at<=now() ORDER BY payer_movement_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(r.payer_movement_id::text,481));
  PERFORM pg_advisory_xact_lock(hashtextextended(r.merchant_movement_id::text,481));
  UPDATE public.qard_refund_requests SET status='timed_out',decision_reason='Sin respuesta en 72 horas',decided_at=now() WHERE id=r.id AND status='pending' AND expires_at<=now();
  IF FOUND THEN n:=n+1; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(73819001);
 IF NOT EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='qard-refund-timeout';
 END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_expire() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_expire() TO service_role;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE status='pending') THEN PERFORM cron.schedule('qard-refund-timeout','* * * * *','SELECT qard_private.qard_refund_expire()'); END IF; END $$;
ALTER FUNCTION qard_private.qard_refund_decide(uuid,boolean,numeric,text) RENAME TO qard_refund_settle;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('qard_private.qard_refund_settle(uuid,boolean,numeric,text)'::regprocedure);
 body:=replace(body,'r.merchant_user_id<>auth.uid()','(r.merchant_user_id<>auth.uid() AND NOT (public.has_role(auth.uid(),''admin'') AND r.status=''resolving''))');
 body:=replace(body,'IF NOT _approve THEN',E'IF r.status NOT IN (''pending'',''resolving'') THEN RAISE EXCEPTION ''La solicitud ya no puede decidirse''; END IF;\n IF NOT _approve THEN');
 body:=replace(body,'''status'',''completed'');','''status'',''completed'',''partial_index'',(SELECT count(*)+1 FROM public.qard_refund_requests WHERE payer_movement_id=r.payer_movement_id AND status=''completed''),''remaining_after'',remain-_amount,''original_amount'',abs((p->>''monto_mxn'')::numeric));');
 EXECUTE body;
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_settle(uuid,boolean,numeric,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION qard_private.qard_refund_decide(_request uuid,_approve boolean,_amount numeric DEFAULT NULL,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.qard_refund_requests;
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request;
 IF r.id IS NULL OR r.merchant_user_id<>auth.uid() THEN RAISE EXCEPTION 'Solo el dueño del negocio puede decidir'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.payer_movement_id::text,481));
 PERFORM pg_advisory_xact_lock(hashtextextended(r.merchant_movement_id::text,481));
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request FOR UPDATE;
 IF r.status='pending' AND r.expires_at<=now() THEN
  UPDATE public.qard_refund_requests SET status='timed_out',decided_at=now(),decision_reason='Sin respuesta en 72 horas' WHERE id=r.id;
  RETURN jsonb_build_object('status','timed_out');
 END IF;
 RETURN qard_private.qard_refund_settle(_request,_approve,_amount,_reason);
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_decide(uuid,boolean,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_decide(uuid,boolean,numeric,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.qard_refund_decide(_request uuid,_approve boolean,_amount numeric DEFAULT NULL,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_refund_decide(_request,_approve,_amount,_reason) $$;
CREATE FUNCTION qard_private.qard_refund_action(_request uuid,_action text,_reason text DEFAULT NULL,_approve boolean DEFAULT NULL,_amount numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.qard_refund_requests; remain numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
 IF _action='resolve' THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo admin puede resolver disputas'; END IF;
 ELSIF r.payer_user_id<>auth.uid() THEN RAISE EXCEPTION 'Solo el cliente puede cancelar o disputar'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.payer_movement_id::text,481));
 PERFORM pg_advisory_xact_lock(hashtextextended(r.merchant_movement_id::text,481));
 SELECT * INTO r FROM public.qard_refund_requests WHERE id=_request FOR UPDATE;
 IF r.status='pending' AND r.expires_at<=now() THEN UPDATE public.qard_refund_requests SET status='timed_out',decision_reason='Sin respuesta en 72 horas',decided_at=now() WHERE id=r.id; r.status:='timed_out'; END IF;
 IF _action='cancel' THEN
  IF r.status='cancelled' THEN RETURN jsonb_build_object('status','cancelled'); END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'Ya existe una decisión; no se puede cancelar'; END IF;
  UPDATE public.qard_refund_requests SET status='cancelled',decided_at=now() WHERE id=r.id;
 ELSIF _action='dispute' THEN
  IF r.status='disputed' THEN RETURN jsonb_build_object('status','disputed'); END IF;
  IF r.status NOT IN ('rejected','timed_out') THEN RAISE EXCEPTION 'Solo se disputa un rechazo'; END IF;
  IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Explica el motivo de la disputa'; END IF;
  IF EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=r.payer_movement_id AND id<>r.id AND status IN('pending','disputed')) THEN RAISE EXCEPTION 'Ya existe una solicitud o disputa activa del mismo cobro'; END IF;
  remain:=least(public.qard_refund_remaining(r.payer_movement_id),public.qard_refund_remaining(r.merchant_movement_id));
  IF r.requested_amount>remain THEN RAISE EXCEPTION 'El importe ya fue devuelto; no puede disputarse'; END IF;
  PERFORM id FROM public.qard_wallets WHERE titular_user_id=r.merchant_user_id FOR UPDATE;
  UPDATE public.qard_refund_requests SET status='disputed',dispute_reason=btrim(_reason),disputed_at=now() WHERE id=r.id;
 ELSIF _action='resolve' THEN
  IF r.status IN ('completed','dispute_rejected') AND r.resolved_by IS NOT NULL THEN
   IF (_approve AND r.status='completed' AND r.approved_amount=_amount) OR (NOT _approve AND r.status='dispute_rejected') THEN RETURN jsonb_build_object('status',r.status,'amount',r.approved_amount); END IF;
   RAISE EXCEPTION 'Disputa ya resuelta con otra decisión';
  END IF;
  IF r.status<>'disputed' OR _approve IS NULL OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Indica la resolución y su motivo'; END IF;
  PERFORM id FROM public.qard_wallets WHERE titular_user_id=r.merchant_user_id FOR UPDATE;
  IF _approve THEN
   UPDATE public.qard_refund_requests SET status='resolving',resolved_by=auth.uid() WHERE id=r.id;
   RETURN qard_private.qard_refund_settle(r.id,true,_amount,_reason);
  ELSE UPDATE public.qard_refund_requests SET status='dispute_rejected',resolved_by=auth.uid(),decision_reason=btrim(_reason),decided_at=now() WHERE id=r.id; END IF;
 ELSE RAISE EXCEPTION 'Acción inválida'; END IF;
 RETURN jsonb_build_object('status',(SELECT status FROM public.qard_refund_requests WHERE id=r.id));
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_action(uuid,text,text,boolean,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_action(uuid,text,text,boolean,numeric) TO authenticated,service_role;
CREATE FUNCTION public.qard_refund_action(_request uuid,_action text,_reason text DEFAULT NULL,_approve boolean DEFAULT NULL,_amount numeric DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_refund_action(_request,_action,_reason,_approve,_amount) $$;
REVOKE ALL ON FUNCTION public.qard_refund_action(uuid,text,text,boolean,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_action(uuid,text,text,boolean,numeric) TO authenticated,service_role;
CREATE FUNCTION qard_private.qard_refund_disputes(_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo admin puede revisar disputas'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM(SELECT * FROM public.qard_refund_requests WHERE status='disputed' ORDER BY disputed_at,id LIMIT 100 OFFSET greatest(_offset,0))r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_refund_disputes(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_refund_disputes(integer) TO authenticated,service_role;
CREATE FUNCTION public.qard_refund_disputes(_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_refund_disputes(_offset) $$;
REVOKE ALL ON FUNCTION public.qard_refund_disputes(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_refund_disputes(integer) TO authenticated,service_role;