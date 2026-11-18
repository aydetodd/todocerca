CREATE SCHEMA IF NOT EXISTS qard_private;
REVOKE ALL ON SCHEMA qard_private FROM PUBLIC, anon, authenticated;
CREATE TABLE public.qard_bolsillos (id uuid PRIMARY KEY, titular_user_id uuid NOT NULL, wallet_id uuid NOT NULL REFERENCES public.qard_wallets(id), concepto text NOT NULL, saldo_mxn numeric(18,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT(id,titular_user_id,concepto,created_at,updated_at) ON public.qard_bolsillos TO authenticated;
GRANT ALL ON public.qard_bolsillos TO service_role;
ALTER TABLE public.qard_bolsillos ENABLE ROW LEVEL SECURITY;
CREATE POLICY bolsillo_owner_read ON public.qard_bolsillos FOR SELECT TO authenticated USING(titular_user_id=auth.uid());
CREATE TABLE qard_private.bolsillo_access (bolsillo_id uuid PRIMARY KEY REFERENCES public.qard_bolsillos(id), pin_hash text NOT NULL, failures int NOT NULL DEFAULT 0, blocked_until timestamptz, token_hash text, expires_at timestamptz);
CREATE TABLE qard_private.bolsillo_ops (operation_key uuid PRIMARY KEY, owner_id uuid NOT NULL, bolsillo_id uuid NOT NULL, action text NOT NULL, amount numeric NOT NULL, result jsonb NOT NULL);
CREATE OR REPLACE FUNCTION public.qard_bolsillo_create(_id uuid,_concepto text,_pin text,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); w public.qard_wallets; t text; result jsonb; BEGIN
 IF me IS NULL OR _id IS NULL OR _concepto NOT IN ('Renta','Útiles','Vacaciones','Emergencias','Salud','Otro') OR _pin !~ '^(\d{4}|\d{6})$' OR _pin IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,21));
 IF EXISTS(SELECT 1 FROM public.qard_bolsillos WHERE id=_id) THEN
 IF EXISTS(SELECT 1 FROM public.qard_bolsillos WHERE id=_id AND titular_user_id=me) THEN RETURN jsonb_build_object('ok',true,'id',_id,'repeated',true); END IF; RAISE EXCEPTION 'Identificador no disponible'; END IF;
 SELECT * INTO w FROM public.qard_wallets WHERE titular_user_id=me FOR UPDATE;
 IF w.id IS NULL OR w.saldo_mxn<_amount OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE wallet_id=w.id AND sub_index=0 AND estado='activa') OR public.cuenta_esta_bloqueada(me) THEN RAISE EXCEPTION 'Cuenta 00 no disponible o saldo insuficiente'; END IF;
 INSERT INTO public.qard_bolsillos(id,titular_user_id,wallet_id,concepto,saldo_mxn) VALUES(_id,me,w.id,_concepto,_amount);
 t:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO qard_private.bolsillo_access(bolsillo_id,pin_hash,token_hash,expires_at) VALUES(_id,extensions.crypt(_pin,extensions.gen_salt('bf',10)),encode(extensions.digest(t,'sha256'),'hex'),now()+interval '5 minutes');
 UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn-_amount,updated_at=now() WHERE id=w.id;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,descripcion,metadata) VALUES(w.id,me,'transferencia_p2p_out',_amount,w.saldo_mxn-_amount,'Ahorro en Bolsillo '||_concepto,jsonb_build_object('bolsa','eje','bolsillo_id',_id,'operation_key',_id));
 RETURN jsonb_build_object('ok',true,'id',_id,'token',t,'saldo',_amount); END $$;
CREATE OR REPLACE FUNCTION public.qard_bolsillo_unlock(_id uuid,_pin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a qard_private.bolsillo_access; b public.qard_bolsillos; t text; BEGIN
 SELECT * INTO b FROM public.qard_bolsillos WHERE id=_id AND titular_user_id=auth.uid(); IF b.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Bolsillo no disponible'); END IF;
 SELECT * INTO a FROM qard_private.bolsillo_access WHERE bolsillo_id=_id FOR UPDATE;
 IF a.blocked_until>now() THEN RETURN jsonb_build_object('ok',false,'error','Espera 15 minutos antes de volver a intentar'); END IF;
 IF _pin IS NULL OR _pin !~ '^(\d{4}|\d{6})$' OR extensions.crypt(_pin,a.pin_hash) IS DISTINCT FROM a.pin_hash THEN
 UPDATE qard_private.bolsillo_access SET failures=CASE WHEN blocked_until<=now() THEN 1 ELSE failures+1 END,blocked_until=CASE WHEN (CASE WHEN blocked_until<=now() THEN 0 ELSE failures END)+1>=5 THEN now()+interval '15 minutes' ELSE NULL END, token_hash=NULL,expires_at=NULL WHERE bolsillo_id=_id;
 RETURN jsonb_build_object('ok',false,'error','PIN incorrecto'); END IF;
 t:=encode(extensions.gen_random_bytes(32),'hex'); UPDATE qard_private.bolsillo_access SET failures=0,blocked_until=NULL,token_hash=encode(extensions.digest(t,'sha256'),'hex'),expires_at=now()+interval '5 minutes' WHERE bolsillo_id=_id;
 RETURN jsonb_build_object('ok',true,'token',t,'saldo',b.saldo_mxn); END $$;
CREATE OR REPLACE FUNCTION public.qard_bolsillo_read(_id uuid,_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.qard_bolsillos; BEGIN
 SELECT p.* INTO b FROM public.qard_bolsillos p JOIN qard_private.bolsillo_access a ON a.bolsillo_id=p.id WHERE p.id=_id AND p.titular_user_id=auth.uid() AND a.expires_at>now() AND a.token_hash=encode(extensions.digest(_token,'sha256'),'hex');
 IF b.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Abre de nuevo con tu PIN'); END IF; RETURN jsonb_build_object('ok',true,'saldo',b.saldo_mxn); END $$;
CREATE OR REPLACE FUNCTION public.qard_bolsillo_return(_id uuid,_token text,_amount numeric,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.qard_bolsillos; w public.qard_wallets; o qard_private.bolsillo_ops; result jsonb; BEGIN
 IF auth.uid() IS NULL OR _key IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Monto inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,22));
 IF NOT coalesce((public.qard_bolsillo_read(_id,_token)->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Abre de nuevo con tu PIN'; END IF;
 SELECT * INTO o FROM qard_private.bolsillo_ops WHERE operation_key=_key;
 IF o.operation_key IS NOT NULL THEN IF o.owner_id=auth.uid() AND o.bolsillo_id=_id AND o.amount=_amount AND o.action='return' THEN RETURN o.result; END IF; RAISE EXCEPTION 'Operación diferente'; END IF;
 SELECT * INTO b FROM public.qard_bolsillos WHERE id=_id AND titular_user_id=auth.uid();
 SELECT * INTO w FROM public.qard_wallets WHERE id=b.wallet_id FOR UPDATE;
 SELECT * INTO b FROM public.qard_bolsillos WHERE id=_id AND titular_user_id=auth.uid() FOR UPDATE;
 IF b.saldo_mxn<_amount OR public.cuenta_esta_bloqueada(auth.uid()) THEN RAISE EXCEPTION 'Saldo insuficiente o cuenta bloqueada'; END IF;
 UPDATE public.qard_bolsillos SET saldo_mxn=saldo_mxn-_amount,updated_at=now() WHERE id=_id;
 UPDATE public.qard_wallets SET saldo_mxn=saldo_mxn+_amount,updated_at=now() WHERE id=w.id;
 INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,tipo,monto_mxn,saldo_despues,descripcion,metadata) VALUES(w.id,auth.uid(),'transferencia_p2p_in',_amount,w.saldo_mxn+_amount,'Regreso de Bolsillo '||b.concepto,jsonb_build_object('bolsa','eje','bolsillo_id',_id,'operation_key',_key));
 result:=jsonb_build_object('ok',true,'saldo',b.saldo_mxn-_amount); INSERT INTO qard_private.bolsillo_ops VALUES(_key,auth.uid(),_id,'return',_amount,result); RETURN result; END $$;
REVOKE ALL ON FUNCTION public.qard_bolsillo_create(uuid,text,text,numeric),public.qard_bolsillo_unlock(uuid,text),public.qard_bolsillo_read(uuid,text),public.qard_bolsillo_return(uuid,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_bolsillo_create(uuid,text,text,numeric),public.qard_bolsillo_unlock(uuid,text),public.qard_bolsillo_read(uuid,text),public.qard_bolsillo_return(uuid,text,numeric,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.tg_qard_tcb_hash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE prev text; BEGIN
 IF NOT (NEW.tipo LIKE 'bono_%' OR NEW.ambito='bonos' OR NEW.metadata ? 'bolsillo_id') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tcb'||NEW.wallet_id::text,7)); SELECT hash INTO prev FROM public.qard_tcb_cadena WHERE wallet_id=NEW.wallet_id ORDER BY seq DESC LIMIT 1; prev:=coalesce(prev,repeat('0',64));
 INSERT INTO public.qard_tcb_cadena(movimiento_id,wallet_id,titular_user_id,prev_hash,hash) VALUES(NEW.id,NEW.wallet_id,NEW.titular_user_id,prev,encode(extensions.digest(prev||'|'||NEW.id||'|'||NEW.tipo||'|'||NEW.monto_mxn::text||'|'||coalesce(NEW.saldo_despues::text,'')||'|'||coalesce(NEW.sub_qr_id::text,'')||'|'||NEW.created_at::text,'sha256'),'hex')); RETURN NEW; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='qard_wallets') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_wallets; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='qard_sub_qr') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_sub_qr; END IF;
END $$;