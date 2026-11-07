ALTER TABLE public.terminal_invites ADD COLUMN terminal_name text;
CREATE OR REPLACE FUNCTION public.terminal_set_name(_id uuid, _name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Nombre de terminal inválido'; END IF;
 UPDATE public.terminal_invites SET terminal_name=btrim(_name),updated_at=now() WHERE id=_id AND merchant_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.terminal_set_name(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.terminal_set_name(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.qard_capture_collection_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.terminal_invites; branch_name text; BEGIN
 IF NEW.tipo='cobro_recibido' AND NEW.metadata->>'terminal'='collection' AND NEW.metadata->>'operador_id' IS NOT NULL THEN
 SELECT * INTO i FROM public.terminal_invites WHERE merchant_user_id=NEW.titular_user_id AND invited_user_id::text=NEW.metadata->>'operador_id' AND terminal_code='collection' AND status='accepted' AND active AND negocio_id::text IS NOT DISTINCT FROM NEW.metadata->>'negocio_id' LIMIT 1;
 IF FOUND THEN SELECT nombre INTO branch_name FROM public.qard_negocios WHERE id=i.negocio_id AND owner_id=NEW.titular_user_id;
 NEW.metadata:=NEW.metadata || jsonb_build_object('terminal_id',i.id,'terminal_nombre',coalesce(i.terminal_name,'Terminal · '||right(i.phone,4)),'sucursal_nombre',branch_name); END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER qard_collection_identity BEFORE INSERT ON public.qard_movimientos FOR EACH ROW EXECUTE FUNCTION public.qard_capture_collection_identity();
CREATE OR REPLACE FUNCTION public.qard_collection_report(_start date DEFAULT NULL,_end date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _start IS NOT NULL AND _end IS NOT NULL AND _start>_end THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
 WITH receipts AS (
 SELECT m.id,m.monto_mxn,coalesce(m.metadata->>'negocio_id','unassigned') branch_key,coalesce(m.metadata->>'terminal_id',m.metadata->>'operador_id','unassigned') terminal_key,
 coalesce(m.metadata->>'sucursal_nombre',n.nombre,CASE WHEN m.metadata->>'negocio_id' IS NULL THEN 'Sin sucursal' ELSE 'Sucursal histórica · '||left(m.metadata->>'negocio_id',8) END) branch_name,
 coalesce(m.metadata->>'terminal_nombre',CASE WHEN m.metadata->>'operador_id' IS NOT NULL THEN 'Terminal histórica · '||left(m.metadata->>'operador_id',8) ELSE 'Cobro directo / sin terminal' END) terminal_name
 FROM public.qard_movimientos m LEFT JOIN public.qard_negocios n ON n.id::text=m.metadata->>'negocio_id' AND n.owner_id=auth.uid()
 WHERE m.titular_user_id=auth.uid() AND m.tipo='cobro_recibido' AND m.ambito='cobros'
 AND (_start IS NULL OR m.created_at>=(_start::timestamp AT TIME ZONE 'America/Hermosillo'))
 AND (_end IS NULL OR m.created_at<((_end+1)::timestamp AT TIME ZONE 'America/Hermosillo'))
 ), terminals AS (
 SELECT branch_key,terminal_key,max(terminal_name) name,count(*) count,sum(monto_mxn)*100 cents FROM receipts GROUP BY branch_key,terminal_key
 ), branches AS (
 SELECT r.branch_key,max(r.branch_name) name,count(*) count,sum(r.monto_mxn)*100 cents FROM receipts r GROUP BY r.branch_key
 ), operation_total AS (
 SELECT coalesce(sum(amount_mxn),0)*100 cents,count(*) count FROM public.terminal_operations WHERE merchant_user_id=auth.uid() AND terminal_code='collection'
 AND (_start IS NULL OR created_at>=(_start::timestamp AT TIME ZONE 'America/Hermosillo')) AND (_end IS NULL OR created_at<((_end+1)::timestamp AT TIME ZONE 'America/Hermosillo'))
 ) SELECT jsonb_build_object('total_cents',(coalesce((SELECT sum(monto_mxn) FROM receipts),0)*100)::bigint::text,'count',(SELECT count(*) FROM receipts),'operations_cents',(SELECT cents::bigint::text FROM operation_total),'operations_count',(SELECT count FROM operation_total),'balance_cents',(coalesce((SELECT saldo_comercio_mxn FROM public.qard_wallets WHERE titular_user_id=auth.uid()),0)*100)::bigint::text,
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.branch_key,'name',b.name,'count',b.count,'cents',b.cents::bigint::text,'terminals',(SELECT jsonb_agg(jsonb_build_object('id',t.terminal_key,'name',t.name,'count',t.count,'cents',t.cents::bigint::text) ORDER BY t.name) FROM terminals t WHERE t.branch_key=b.branch_key)) ORDER BY b.name) FROM branches b),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.qard_collection_report(date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.qard_collection_report(date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.qard_collection_details(_start date,_end date,_branch text,_terminal text,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _offset IS NULL OR _offset<0 OR _branch IS NULL OR _terminal IS NULL OR (_start IS NOT NULL AND _end IS NOT NULL AND _start>_end) THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'date',r.created_at,'cents',(r.monto_mxn*100)::bigint::text) ORDER BY r.created_at DESC,r.id DESC) FROM (
 SELECT id,created_at,monto_mxn FROM public.qard_movimientos WHERE titular_user_id=auth.uid() AND tipo='cobro_recibido' AND ambito='cobros'
 AND coalesce(metadata->>'negocio_id','unassigned')=_branch AND coalesce(metadata->>'terminal_id',metadata->>'operador_id','unassigned')=_terminal
 AND (_start IS NULL OR created_at>=(_start::timestamp AT TIME ZONE 'America/Hermosillo')) AND (_end IS NULL OR created_at<((_end+1)::timestamp AT TIME ZONE 'America/Hermosillo')) ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET _offset
 ) r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.qard_collection_details(date,date,text,text,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.qard_collection_details(date,date,text,text,integer) TO authenticated;