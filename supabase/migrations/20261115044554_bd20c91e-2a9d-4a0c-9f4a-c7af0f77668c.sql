ALTER TABLE public.pagos_config ADD COLUMN IF NOT EXISTS despensa_habilitada boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.qard_bono_indice(_cat text) RETURNS int LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _cat WHEN 'alimentos' THEN 2 WHEN 'despensa' THEN 3 WHEN 'gasolina' THEN 4 WHEN 'farmacia' THEN 5 WHEN 'papeleria' THEN 6 END $$;
CREATE OR REPLACE FUNCTION public.qard_giro_bonos(_giro text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _giro WHEN 'comida' THEN ARRAY['alimentos','despensa'] WHEN 'gasolinera' THEN ARRAY['gasolina'] WHEN 'farmacia' THEN ARRAY['farmacia'] WHEN 'papeleria' THEN ARRAY['papeleria'] ELSE ARRAY[]::text[] END $$;
CREATE OR REPLACE FUNCTION public.qard_despensa_on() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT bool_or(despensa_habilitada) FROM public.pagos_config),false) $$;

-- Mover familiares 02-10 a 11+
DO $$ DECLARE r record; n int; BEGIN
 FOR r IN SELECT * FROM public.qard_sub_qr WHERE sub_index BETWEEN 2 AND 10 ORDER BY wallet_id, sub_index LOOP
  n:=11; WHILE EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE wallet_id=r.wallet_id AND sub_index=n) LOOP n:=n+1; END LOOP;
  UPDATE public.qard_sub_qr SET sub_index=n, qard_number=left(qard_number,14)||lpad(n::text,2,'0') WHERE id=r.id;
  INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',r.titular_user_id,format('QaRd: tu tarjeta familiar "%s" cambió de terminación %s a %s. El número y QR anteriores ya no sirven; usa el nuevo desde QaRd.',r.alias,lpad(r.sub_index::text,2,'0'),lpad(n::text,2,'0')),false);
 END LOOP; END $$;

ALTER TABLE public.qard_sub_qr ADD CONSTRAINT qard_sub_qr_terminaciones CHECK (
 sub_index=0 OR (sub_index=1 AND tipo='empresarial') OR (sub_index=2 AND tipo='bono_alimentos') OR (sub_index=3 AND tipo='bono_despensa')
 OR (sub_index=4 AND tipo='bono_gasolina') OR (sub_index=5 AND tipo='bono_farmacia') OR (sub_index=6 AND tipo='bono_papeleria') OR (sub_index>=11 AND tipo='familiar'));

-- Guarda: solo funciones de bonos tocan tarjetas de bono
CREATE OR REPLACE FUNCTION public.qard_bono_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ok boolean:=coalesce(current_setting('qard.bono_op',true),'')='1'; BEGIN
 IF TG_OP='DELETE' THEN IF OLD.tipo LIKE 'bono_%' AND NOT ok THEN RAISE EXCEPTION 'Tarjeta de bono protegida'; END IF; RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN IF NEW.tipo LIKE 'bono_%' AND NOT ok THEN RAISE EXCEPTION 'Tarjeta de bono protegida'; END IF;
 ELSIF (OLD.tipo LIKE 'bono_%' OR NEW.tipo LIKE 'bono_%') AND NOT ok AND
   (to_jsonb(NEW)-'cvv'-'cvv_dinamico'-'cvv_updated_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'cvv'-'cvv_dinamico'-'cvv_updated_at'-'updated_at') THEN
   RAISE EXCEPTION 'Un bono solo puede moverse dentro de su categoría';
 END IF;
 IF NEW.tipo='bono_despensa' AND NEW.estado='activa' AND NOT public.qard_despensa_on() THEN RAISE EXCEPTION 'Despensa Digital apagada'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER qard_bono_guard BEFORE INSERT OR UPDATE OR DELETE ON public.qard_sub_qr FOR EACH ROW EXECUTE FUNCTION public.qard_bono_guard();

CREATE OR REPLACE FUNCTION public.qard_ensure_bono(_wallet uuid, _cat text) RETURNS public.qard_sub_qr LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.qard_sub_qr; s public.qard_sub_qr; idx int:=public.qard_bono_indice(_cat); BEGIN
 IF idx IS NULL THEN RAISE EXCEPTION 'Bono no válido'; END IF;
 SELECT * INTO s FROM public.qard_sub_qr WHERE wallet_id=_wallet AND sub_index=idx; IF FOUND THEN RETURN s; END IF;
 SELECT * INTO p FROM public.qard_sub_qr WHERE wallet_id=_wallet AND sub_index=0; IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta QaRd no disponible'; END IF;
 PERFORM set_config('qard.bono_op','1',true);
 INSERT INTO public.qard_sub_qr(wallet_id,titular_user_id,sub_index,qard_number,alias,tipo,estado)
 VALUES(_wallet,p.titular_user_id,idx,left(p.qard_number,14)||lpad(idx::text,2,'0'),
  CASE _cat WHEN 'alimentos' THEN 'Bono Alimentos' WHEN 'despensa' THEN 'Despensa Digital' WHEN 'gasolina' THEN 'Bono Gasolina' WHEN 'farmacia' THEN 'Bono Farmacia' ELSE 'Bono Papelería' END,
  'bono_'||_cat, CASE WHEN _cat='despensa' AND NOT public.qard_despensa_on() THEN 'apagada' ELSE 'activa' END) RETURNING * INTO s;
 PERFORM set_config('qard.bono_op','',true);
 RETURN s; END $$;
REVOKE ALL ON FUNCTION public.qard_ensure_bono(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.qard_despensa_al_nacer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NEW.sub_index=0 THEN PERFORM public.qard_ensure_bono(NEW.wallet_id,'despensa'); END IF; RETURN NEW; END $$;
CREATE TRIGGER qard_despensa_al_nacer AFTER INSERT ON public.qard_sub_qr FOR EACH ROW EXECUTE FUNCTION public.qard_despensa_al_nacer();
DO $$ DECLARE w uuid; BEGIN FOR w IN SELECT wallet_id FROM public.qard_sub_qr WHERE sub_index=0 LOOP PERFORM public.qard_ensure_bono(w,'despensa'); END LOOP; END $$;

-- Libro: nuevos tipos y cubeta bonos
ALTER TABLE public.qard_movimientos DROP CONSTRAINT qard_movimientos_tipo_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_tipo_check CHECK (tipo = ANY (ARRAY['recarga','comision','cobro_comercio','cobro_recibido','devolucion','ajuste','transfer_a_sub','transfer_desde_sub','transferencia_p2p_out','transferencia_p2p_in','retiro_oxxo','retiro_spei','retiro_qard','traspaso_cobros_out','traspaso_cobros_in','bono_recibido','bono_pago','bono_cobro_recibido','bono_conversion_out','bono_conversion_in']));
ALTER TABLE public.qard_movimientos DROP CONSTRAINT qard_movimientos_ambito_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_ambito_check CHECK (ambito IS NULL OR ambito = ANY (ARRAY['eje','sub_qr','cobros','bonos']));
CREATE UNIQUE INDEX IF NOT EXISTS qard_mov_bono_key ON public.qard_movimientos ((metadata->>'operation_key'), tipo) WHERE tipo IN ('bono_recibido','bono_pago','bono_conversion_out','bono_conversion_in');

CREATE OR REPLACE FUNCTION public.tg_qard_mov_ambito() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$ DECLARE _idx int; BEGIN
 IF NEW.sub_qr_id IS NOT NULL THEN SELECT sub_index INTO _idx FROM public.qard_sub_qr WHERE id=NEW.sub_qr_id; END IF;
 IF NEW.ambito IS NULL THEN NEW.ambito:=CASE WHEN NEW.tipo='bono_conversion_in' THEN 'cobros' WHEN NEW.tipo LIKE 'bono_%' OR coalesce(_idx,0) BETWEEN 2 AND 10 THEN 'bonos' WHEN NEW.metadata->>'bolsa'='comercio' OR NEW.tipo IN ('cobro_recibido','traspaso_cobros_out') THEN 'cobros' WHEN NEW.tipo IN ('recarga','comision','transfer_a_sub','transfer_desde_sub','traspaso_cobros_in','ajuste') THEN 'eje' WHEN coalesce(_idx,0)>0 THEN 'sub_qr' ELSE 'eje' END; END IF;
 IF NEW.direccion IS NULL THEN NEW.direccion:=CASE WHEN NEW.tipo IN ('recarga','cobro_recibido','traspaso_cobros_in','transferencia_p2p_in','transfer_desde_sub','devolucion','bono_recibido','bono_cobro_recibido','bono_conversion_in') OR (NEW.tipo='ajuste' AND NEW.monto_mxn>=0) THEN 'entrada' ELSE 'salida' END; END IF; RETURN NEW; END $function$;

-- Cadena de huellas TCB
CREATE TABLE public.qard_tcb_cadena (seq bigserial PRIMARY KEY, movimiento_id uuid NOT NULL UNIQUE, wallet_id uuid NOT NULL, titular_user_id uuid NOT NULL, prev_hash text NOT NULL, hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.qard_tcb_cadena TO authenticated; GRANT ALL ON public.qard_tcb_cadena TO service_role;
ALTER TABLE public.qard_tcb_cadena ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Titular ve sus huellas" ON public.qard_tcb_cadena FOR SELECT TO authenticated USING (titular_user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.tg_qard_tcb_hash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev text; BEGIN
 IF NOT (NEW.tipo LIKE 'bono_%' OR NEW.ambito='bonos') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tcb'||NEW.wallet_id::text,7));
 SELECT hash INTO prev FROM public.qard_tcb_cadena WHERE wallet_id=NEW.wallet_id ORDER BY seq DESC LIMIT 1;
 prev:=coalesce(prev,repeat('0',64));
 INSERT INTO public.qard_tcb_cadena(movimiento_id,wallet_id,titular_user_id,prev_hash,hash) VALUES(NEW.id,NEW.wallet_id,NEW.titular_user_id,prev,
  encode(extensions.digest(prev||'|'||NEW.id||'|'||NEW.tipo||'|'||NEW.monto_mxn::text||'|'||coalesce(NEW.saldo_despues::text,'')||'|'||coalesce(NEW.sub_qr_id::text,'')||'|'||NEW.created_at::text,'sha256'),'hex'));
 RETURN NEW; END $$;
CREATE TRIGGER qard_tcb_hash AFTER INSERT ON public.qard_movimientos FOR EACH ROW EXECUTE FUNCTION public.tg_qard_tcb_hash();

-- Giro y sellos
CREATE TABLE public.qard_comercio_giro (user_id uuid PRIMARY KEY, giro text NOT NULL CHECK (giro IN ('comida','gasolinera','farmacia','papeleria','otro')), estado text NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','approved','rejected')), sellos text[] NOT NULL DEFAULT '{}', revisado_por uuid, revisado_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.qard_comercio_giro TO authenticated; GRANT ALL ON public.qard_comercio_giro TO service_role;
ALTER TABLE public.qard_comercio_giro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dueño o admin ve giro" ON public.qard_comercio_giro FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER qard_comercio_giro_updated BEFORE UPDATE ON public.qard_comercio_giro FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.qard_comercio_bonos (user_id uuid NOT NULL, categoria text NOT NULL CHECK (categoria IN ('alimentos','despensa','gasolina','farmacia','papeleria')), saldo_mxn numeric NOT NULL DEFAULT 0 CHECK (saldo_mxn>=0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,categoria));
GRANT SELECT ON public.qard_comercio_bonos TO authenticated; GRANT ALL ON public.qard_comercio_bonos TO service_role;
ALTER TABLE public.qard_comercio_bonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comercio ve sus bonos" ON public.qard_comercio_bonos FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.qard_bono_lotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_user_id uuid NOT NULL, categoria text NOT NULL CHECK (categoria IN ('alimentos','despensa','gasolina','farmacia','papeleria')), monto_total numeric NOT NULL CHECK (monto_total>0), saldo_disponible numeric NOT NULL CHECK (saldo_disponible>=0), folio_factura text NOT NULL UNIQUE, creado_por uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.qard_bono_lotes TO authenticated; GRANT ALL ON public.qard_bono_lotes TO service_role;
ALTER TABLE public.qard_bono_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Empresa o admin ve lotes" ON public.qard_bono_lotes FOR SELECT TO authenticated USING (empresa_user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.qard_bono_entregas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid NOT NULL REFERENCES public.qard_bono_lotes(id), empresa_user_id uuid NOT NULL, empleado_user_id uuid NOT NULL, monto numeric NOT NULL CHECK (monto>0), operation_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.qard_bono_entregas TO authenticated; GRANT ALL ON public.qard_bono_entregas TO service_role;
ALTER TABLE public.qard_bono_entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partes ven entregas" ON public.qard_bono_entregas FOR SELECT TO authenticated USING (empresa_user_id=auth.uid() OR empleado_user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.qard_giro_solicitar(_giro text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); BEGIN
 IF me IS NULL OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=me AND sub_index=1) THEN RAISE EXCEPTION 'Necesitas Card Empresarial 01'; END IF;
 IF _giro NOT IN ('comida','gasolinera','farmacia','papeleria','otro') THEN RAISE EXCEPTION 'Giro no válido'; END IF;
 INSERT INTO public.qard_comercio_giro(user_id,giro) VALUES(me,_giro)
 ON CONFLICT(user_id) DO UPDATE SET giro=EXCLUDED.giro, estado='pending', sellos='{}', revisado_por=NULL, revisado_at=NULL WHERE qard_comercio_giro.giro<>EXCLUDED.giro OR qard_comercio_giro.estado='rejected';
 RETURN jsonb_build_object('ok',true); END $$;

CREATE OR REPLACE FUNCTION public.qard_giro_revisar(_user uuid, _aprobar boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo administradores'; END IF;
 UPDATE public.qard_comercio_giro SET estado=CASE WHEN _aprobar THEN 'approved' ELSE 'rejected' END, sellos='{}', revisado_por=auth.uid(), revisado_at=now() WHERE user_id=_user AND estado='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no pendiente'; END IF;
 INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',_user,CASE WHEN _aprobar THEN 'QaRd: tu giro de negocio fue aprobado. Ya puedes prender tus sellos de bonos en Gestionar mi empresa.' ELSE 'QaRd: tu giro de negocio no fue aprobado. Revisa los datos y vuelve a solicitar.' END,false);
 RETURN jsonb_build_object('ok',true); END $$;

CREATE OR REPLACE FUNCTION public.qard_sello_set(_categoria text, _on boolean) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.qard_comercio_giro; BEGIN
 SELECT * INTO g FROM public.qard_comercio_giro WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR g.estado<>'approved' THEN RAISE EXCEPTION 'Tu giro aún no está aprobado'; END IF;
 IF NOT (_categoria = ANY(public.qard_giro_bonos(g.giro))) THEN RAISE EXCEPTION 'Tu giro no puede aceptar este bono'; END IF;
 IF _on AND _categoria='despensa' AND NOT public.qard_despensa_on() THEN RAISE EXCEPTION 'Despensa Digital aún no está habilitada'; END IF;
 UPDATE public.qard_comercio_giro SET sellos=CASE WHEN _on THEN (SELECT array_agg(DISTINCT x) FROM unnest(sellos||_categoria) x) ELSE array_remove(sellos,_categoria) END WHERE user_id=g.user_id RETURNING sellos INTO g.sellos;
 RETURN g.sellos; END $$;

CREATE OR REPLACE FUNCTION public.qard_sellos_publicos(_ids uuid[]) RETURNS TABLE(user_id uuid, sellos text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT g.user_id, CASE WHEN public.qard_despensa_on() THEN g.sellos ELSE array_remove(g.sellos,'despensa') END FROM public.qard_comercio_giro g
 WHERE g.user_id = ANY(_ids[1:500]) AND g.estado='approved' AND cardinality(g.sellos)>0 AND public.terminal_merchant_valid(g.user_id) $$;
GRANT EXECUTE ON FUNCTION public.qard_sellos_publicos(uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.qard_despensa_switch(_on boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo administradores'; END IF;
 UPDATE public.pagos_config SET despensa_habilitada=_on;
 PERFORM set_config('qard.bono_op','1',true);
 UPDATE public.qard_sub_qr SET estado=CASE WHEN _on THEN 'activa' ELSE 'apagada' END WHERE tipo='bono_despensa' AND estado<>'cancelada';
 IF NOT _on THEN UPDATE public.qard_comercio_giro SET sellos=array_remove(sellos,'despensa') WHERE 'despensa'=ANY(sellos); END IF;
 RETURN _on; END $$;

-- Admin registra compra de bonos (ya facturada y pagada)
CREATE OR REPLACE FUNCTION public.qard_bono_emitir_lote(_telefono text, _categoria text, _monto numeric, _folio text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE emp uuid; lid uuid; BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Solo administradores'; END IF;
 IF public.qard_bono_indice(_categoria) IS NULL OR _monto IS NULL OR _monto<=0 OR _monto<>round(_monto,2) OR coalesce(trim(_folio),'')='' THEN RAISE EXCEPTION 'Datos incompletos'; END IF;
 SELECT f.user_id INTO emp FROM public.find_user_by_phone(_telefono) f LIMIT 1;
 IF emp IS NULL OR NOT public.terminal_merchant_valid(emp) THEN RAISE EXCEPTION 'Empresa sin Card Empresarial validada'; END IF;
 INSERT INTO public.qard_bono_lotes(empresa_user_id,categoria,monto_total,saldo_disponible,folio_factura,creado_por) VALUES(emp,_categoria,_monto,_monto,trim(_folio),auth.uid()) RETURNING id INTO lid;
 INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',emp,format('QaRd: se registraron $%s en bonos %s (factura %s) para repartir a tus empleados.',_monto,_categoria,trim(_folio)),false);
 RETURN lid; END $$;

-- Empresa entrega bono a empleado
CREATE OR REPLACE FUNCTION public.qard_bono_entregar(_lote uuid, _telefono text, _monto numeric, _key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); l public.qard_bono_lotes; emp uuid; w uuid; s public.qard_sub_qr; prior public.qard_bono_entregas; BEGIN
 IF me IS NULL OR _key IS NULL OR _monto IS NULL OR _monto<=0 OR _monto<>round(_monto,2) THEN RAISE EXCEPTION 'Datos incompletos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,9));
 SELECT * INTO prior FROM public.qard_bono_entregas WHERE operation_key=_key;
 IF FOUND THEN IF prior.empresa_user_id<>me OR prior.lote_id<>_lote OR prior.monto<>_monto THEN RAISE EXCEPTION 'Operación usada con otros datos'; END IF; RETURN jsonb_build_object('ok',true,'repetida',true); END IF;
 SELECT * INTO l FROM public.qard_bono_lotes WHERE id=_lote AND empresa_user_id=me FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lote no disponible'; END IF;
 IF l.saldo_disponible<_monto THEN RAISE EXCEPTION 'El lote no tiene suficiente'; END IF;
 SELECT f.user_id INTO emp FROM public.find_user_by_phone(_telefono) f LIMIT 1;
 IF emp IS NULL OR emp=me THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;
 SELECT wallet_id INTO w FROM public.qard_sub_qr WHERE titular_user_id=emp AND sub_index=0;
 IF w IS NULL THEN RAISE EXCEPTION 'El empleado aún no tiene QaRd'; END IF;
 s:=public.qard_ensure_bono(w,l.categoria);
 SELECT * INTO s FROM public.qard_sub_qr WHERE id=s.id FOR UPDATE;
 PERFORM set_config('qard.bono_op','1',true);
 UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn+_monto WHERE id=s.id RETURNING * INTO s;
 PERFORM set_config('qard.bono_op','',true);
 UPDATE public.qard_bono_lotes SET saldo_disponible=saldo_disponible-_monto WHERE id=l.id;
 INSERT INTO public.qard_bono_entregas(lote_id,empresa_user_id,empleado_user_id,monto,operation_key) VALUES(l.id,me,emp,_monto,_key);
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,descripcion,metadata)
 VALUES(w,emp,s.id,'bono_recibido',_monto,s.saldo_mxn,me,'Bono recibido de tu empresa',jsonb_build_object('categoria',l.categoria,'operation_key',_key,'lote',l.id,'folio_factura',l.folio_factura));
 INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',emp,format('QaRd: recibiste $%s en %s. Saldo del bono: $%s.',_monto,s.alias,s.saldo_mxn),false);
 RETURN jsonb_build_object('ok',true,'saldo',s.saldo_mxn); END $$;

-- Pago con bono en comercio con sello
CREATE OR REPLACE FUNCTION public.qard_bono_pagar(_from text, _merchant text, _amount numeric, _cvv text, _key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); src public.qard_sub_qr; dst public.qard_sub_qr; cat text; g public.qard_comercio_giro; dw uuid; nb numeric; prior public.qard_movimientos; BEGIN
 IF me IS NULL OR _from !~ '^\d{16}$' OR _merchant !~ '^\d{16}$' OR _cvv !~ '^\d{3}$' OR _key IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Revisa número, monto y CVV de 3 dígitos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text||_key::text,11));
 SELECT * INTO prior FROM public.qard_movimientos WHERE tipo='bono_pago' AND metadata->>'operation_key'=_key::text;
 IF FOUND THEN IF prior.titular_user_id<>me OR prior.monto_mxn<>_amount THEN RAISE EXCEPTION 'Operación usada con otros datos'; END IF; RETURN jsonb_build_object('ok',true,'repetida',true); END IF;
 IF NOT public.qard_rate_limit_check(me,'bono_pago',10,60) THEN RAISE EXCEPTION 'Demasiados intentos'; END IF;
 SELECT * INTO src FROM public.qard_sub_qr WHERE qard_number=_from AND titular_user_id=me AND tipo LIKE 'bono_%' FOR UPDATE;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE qard_number=_merchant AND sub_index=1;
 IF src.id IS NULL OR dst.id IS NULL OR dst.titular_user_id=me THEN RAISE EXCEPTION 'Tarjetas no disponibles'; END IF;
 cat:=substr(src.tipo,6);
 IF src.estado<>'activa' OR dst.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta apagada'; END IF;
 IF cat='despensa' AND NOT public.qard_despensa_on() THEN RAISE EXCEPTION 'Despensa Digital apagada'; END IF;
 IF NOT public.terminal_merchant_valid(dst.titular_user_id) OR public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(dst.titular_user_id) THEN RAISE EXCEPTION 'Comercio no disponible'; END IF;
 SELECT * INTO g FROM public.qard_comercio_giro WHERE user_id=dst.titular_user_id;
 IF g.estado IS DISTINCT FROM 'approved' OR NOT (cat = ANY(g.sellos)) THEN RAISE EXCEPTION 'Este comercio no acepta este bono'; END IF;
 IF public.qard_dec(src.cvv) IS DISTINCT FROM _cvv THEN RAISE EXCEPTION 'CVV de 3 dígitos incorrecto'; END IF;
 IF src.saldo_mxn<_amount THEN RAISE EXCEPTION 'Saldo del bono insuficiente'; END IF;
 PERFORM set_config('qard.bono_op','1',true);
 UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn-_amount WHERE id=src.id RETURNING * INTO src;
 PERFORM set_config('qard.bono_op','',true);
 INSERT INTO public.qard_comercio_bonos(user_id,categoria,saldo_mxn) VALUES(dst.titular_user_id,cat,_amount)
  ON CONFLICT(user_id,categoria) DO UPDATE SET saldo_mxn=qard_comercio_bonos.saldo_mxn+EXCLUDED.saldo_mxn, updated_at=now() RETURNING saldo_mxn INTO nb;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,descripcion,metadata)
 VALUES(src.wallet_id,me,src.id,'bono_pago',_amount,src.saldo_mxn,dst.titular_user_id,'Pago con '||src.alias,jsonb_build_object('categoria',cat,'operation_key',_key)),
       (dst.wallet_id,dst.titular_user_id,NULL,'bono_cobro_recibido',_amount,nb,dst.titular_user_id,'Cobro con '||src.alias,jsonb_build_object('categoria',cat,'operation_key',_key,'bolsa','bono_comercio'));
 RETURN jsonb_build_object('ok',true,'saldo',src.saldo_mxn); END $$;

-- Conversión de bonos a saldo general (Empresarial)
CREATE OR REPLACE FUNCTION public.qard_bono_convertir(_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); emp public.qard_sub_qr; r record; total numeric:=0; nuevo numeric; BEGIN
 IF me IS NULL OR _key IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text||'conv',13));
 IF EXISTS(SELECT 1 FROM public.qard_movimientos WHERE tipo='bono_conversion_in' AND metadata->>'operation_key'=_key::text AND titular_user_id=me) THEN RETURN jsonb_build_object('ok',true,'repetida',true); END IF;
 SELECT * INTO emp FROM public.qard_sub_qr WHERE titular_user_id=me AND sub_index=1;
 IF emp.id IS NULL OR NOT public.terminal_merchant_valid(me) THEN RAISE EXCEPTION 'Card Empresarial no validada'; END IF;
 PERFORM 1 FROM public.qard_wallets WHERE id=emp.wallet_id FOR UPDATE;
 FOR r IN SELECT categoria, saldo_mxn FROM public.qard_comercio_bonos WHERE user_id=me AND saldo_mxn>0 ORDER BY categoria FOR UPDATE LOOP
  UPDATE public.qard_comercio_bonos SET saldo_mxn=0, updated_at=now() WHERE user_id=me AND categoria=r.categoria;
  INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,descripcion,metadata)
  VALUES(emp.wallet_id,me,'bono_conversion_out',r.saldo_mxn,0,'Bono '||r.categoria||' convertido',jsonb_build_object('categoria',r.categoria,'operation_key',_key::text||':'||r.categoria,'bolsa','bono_comercio'));
  total:=total+r.saldo_mxn;
 END LOOP;
 IF total=0 THEN RAISE EXCEPTION 'No tienes bonos por convertir'; END IF;
 UPDATE public.qard_wallets SET saldo_comercio_mxn=coalesce(saldo_comercio_mxn,0)+total WHERE id=emp.wallet_id RETURNING saldo_comercio_mxn INTO nuevo;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,descripcion,metadata)
 VALUES(emp.wallet_id,me,'bono_conversion_in',total,nuevo,'Bonos convertidos a saldo general',jsonb_build_object('operation_key',_key,'bolsa','comercio'));
 RETURN jsonb_build_object('ok',true,'total',total,'saldo',nuevo); END $$;

-- Transferencia homóloga
CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(_from_numero16 text, _to_numero16 text, _cvv text, _monto numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me uuid:=auth.uid(); src public.qard_sub_qr; dst public.qard_sub_qr; sw public.qard_wallets; dw public.qard_wallets; a numeric; b numeric; expected text; next_cvv text; es_bono boolean; BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _monto IS NULL OR _monto<=0 OR _monto<>round(_monto,2) OR _monto::text IN ('NaN','Infinity','-Infinity') OR _cvv IS NULL OR _cvv !~ '^\d{4}$' OR _from_numero16 IS NULL OR _to_numero16 IS NULL OR _from_numero16 !~ '^\d{16}$' OR _to_numero16 !~ '^\d{16}$' THEN RAISE EXCEPTION 'Monto, número o CVV dinámico de 4 dígitos inválido'; END IF;
 IF _from_numero16=_to_numero16 THEN RAISE EXCEPTION 'Origen y destino son la misma cuenta'; END IF;
 IF NOT public.qard_rate_limit_check(me,'qard_transfer_p2p',5,60) THEN RAISE EXCEPTION 'Espera un minuto'; END IF;
 SELECT * INTO src FROM public.qard_sub_qr WHERE qard_number=_from_numero16 AND titular_user_id=me;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE qard_number=_to_numero16;
 IF src.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'Cuenta no disponible'; END IF;
 es_bono:=src.tipo LIKE 'bono_%' OR dst.tipo LIKE 'bono_%';
 IF es_bono AND src.tipo IS DISTINCT FROM dst.tipo THEN RAISE EXCEPTION 'Un bono solo puede enviarse a una cuenta con el mismo bono'; END IF;
 IF es_bono AND src.tipo='bono_despensa' AND NOT public.qard_despensa_on() THEN RAISE EXCEPTION 'Despensa Digital apagada'; END IF;
 PERFORM id FROM public.qard_wallets WHERE id IN (src.wallet_id,dst.wallet_id) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.qard_sub_qr WHERE id IN (src.id,dst.id) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM public.qard_sub_qr WHERE id=src.id;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE id=dst.id;
 SELECT * INTO sw FROM public.qard_wallets WHERE id=src.wallet_id;
 SELECT * INTO dw FROM public.qard_wallets WHERE id=dst.wallet_id;
 IF src.estado<>'activa' OR dst.estado<>'activa' OR sw.estado<>'activa' OR dw.estado<>'activa' THEN RAISE EXCEPTION 'Tarjeta apagada'; END IF;
 IF public.cuenta_esta_bloqueada(me) OR public.cuenta_esta_bloqueada(dst.titular_user_id) THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
 IF (src.sub_index=1 AND NOT public.terminal_merchant_valid(me)) OR (dst.sub_index=1 AND NOT public.terminal_merchant_valid(dst.titular_user_id)) THEN RAISE EXCEPTION 'Empresarial no validada'; END IF;
 expected:=public.qard_dec(CASE WHEN dst.sub_index=0 THEN coalesce(dw.cvv_dinamico,dst.cvv_dinamico) ELSE dst.cvv_dinamico END);
 IF expected IS DISTINCT FROM _cvv THEN RAISE EXCEPTION 'CVV dinámico incorrecto o ya utilizado'; END IF;
 a:=CASE WHEN src.sub_index=0 THEN sw.saldo_mxn WHEN src.sub_index=1 THEN sw.saldo_comercio_mxn ELSE src.saldo_mxn END;
 IF a<_monto THEN RAISE EXCEPTION 'Saldo insuficiente en origen'; END IF;
 IF es_bono THEN PERFORM set_config('qard.bono_op','1',true); END IF;
 IF src.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn-_monto WHERE id=sw.id;
 ELSIF src.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn-_monto WHERE id=sw.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn-_monto WHERE id=src.id; END IF;
 SELECT * INTO dw FROM public.qard_wallets WHERE id=dst.wallet_id;
 SELECT * INTO dst FROM public.qard_sub_qr WHERE id=dst.id;
 b:=CASE WHEN dst.sub_index=0 THEN dw.saldo_mxn WHEN dst.sub_index=1 THEN dw.saldo_comercio_mxn ELSE dst.saldo_mxn END;
 LOOP next_cvv:=public.gen_cvv4(); EXIT WHEN next_cvv<>expected; END LOOP;
 IF dst.sub_index=0 THEN UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn+_monto,cvv_dinamico=public.qard_enc(next_cvv) WHERE id=dw.id;
 ELSIF dst.sub_index=1 THEN UPDATE public.qard_wallets SET saldo_comercio_mxn=saldo_comercio_mxn+_monto WHERE id=dw.id;
 ELSE UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn+_monto WHERE id=dst.id; END IF;
 UPDATE public.qard_sub_qr SET cvv_dinamico=public.qard_enc(next_cvv) WHERE id=dst.id;
 IF es_bono THEN PERFORM set_config('qard.bono_op','',true); END IF;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,descripcion,metadata) VALUES(sw.id,me,CASE WHEN src.sub_index=0 THEN NULL ELSE src.id END,'transferencia_p2p_out',_monto,a-_monto,'Transferencia enviada',jsonb_build_object('bolsa',CASE WHEN es_bono THEN 'bono' WHEN src.sub_index=1 THEN 'comercio' ELSE 'personal' END)),(dw.id,dst.titular_user_id,CASE WHEN dst.sub_index=0 THEN NULL ELSE dst.id END,'transferencia_p2p_in',_monto,b+_monto,'Transferencia recibida',jsonb_build_object('bolsa',CASE WHEN es_bono THEN 'bono' WHEN dst.sub_index=1 THEN 'comercio' ELSE 'personal' END));
 RETURN jsonb_build_object('ok',true); END $function$;

REVOKE EXECUTE ON FUNCTION public.qard_giro_solicitar(text), public.qard_giro_revisar(uuid,boolean), public.qard_sello_set(text,boolean), public.qard_despensa_switch(boolean), public.qard_bono_emitir_lote(text,text,numeric,text), public.qard_bono_entregar(uuid,text,numeric,uuid), public.qard_bono_pagar(text,text,numeric,text,uuid), public.qard_bono_convertir(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.qard_giro_solicitar(text), public.qard_giro_revisar(uuid,boolean), public.qard_sello_set(text,boolean), public.qard_despensa_switch(boolean), public.qard_bono_emitir_lote(text,text,numeric,text), public.qard_bono_entregar(uuid,text,numeric,uuid), public.qard_bono_pagar(text,text,numeric,text,uuid), public.qard_bono_convertir(uuid), public.qard_despensa_on() TO authenticated;