ALTER TABLE public.terminal_invites DROP CONSTRAINT terminal_invites_merchant_user_id_phone_terminal_code_key;
CREATE UNIQUE INDEX terminal_invites_branch_registration ON public.terminal_invites(merchant_user_id,phone,terminal_code,coalesce(negocio_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE OR REPLACE FUNCTION public.terminal_register_scoped(_phone text,_code text,_negocio uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); v_phone text; v_user uuid; inv public.terminal_invites; BEGIN
 IF me IS NULL OR NOT public.terminal_merchant_valid(me) OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=me AND sub_index=1 AND estado='activa') THEN RAISE EXCEPTION 'Activa primero tu QaRd Empresarial'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.terminal_catalog WHERE code=_code AND operational) THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
 IF _negocio IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.qard_negocios WHERE id=_negocio AND owner_id=me) THEN RAISE EXCEPTION 'Sucursal no encontrada'; END IF;
 v_phone:=coalesce(public.normalize_phone(_phone),''); IF length(v_phone)<10 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text||v_phone||_code,74));
 SELECT * INTO inv FROM public.terminal_invites WHERE merchant_user_id=me AND phone=v_phone AND terminal_code=_code AND negocio_id IS NOT DISTINCT FROM _negocio FOR UPDATE;
 IF inv.id IS NOT NULL AND inv.status='accepted' THEN RETURN inv.token; END IF;
 IF inv.id IS NULL THEN INSERT INTO public.terminal_invites(merchant_user_id,phone,terminal_code,negocio_id) VALUES(me,v_phone,_code,_negocio) RETURNING * INTO inv;
 ELSE UPDATE public.terminal_invites SET status='pending',active=false,invited_user_id=NULL,accepted_at=NULL WHERE id=inv.id RETURNING * INTO inv; END IF;
 SELECT user_id INTO v_user FROM public.profiles WHERE public.terminal_phone_matches(telefono,v_phone) LIMIT 1;
 IF v_user=me THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text,73));
 UPDATE public.terminal_invites SET status='accepted',invited_user_id=me,accepted_at=now(),active=false WHERE id=inv.id;
 INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by,active) VALUES(me,_code,'accepted',me,false) ON CONFLICT(user_id,terminal_code) DO NOTHING;
 ELSIF v_user IS NOT NULL AND inv.status='pending' THEN INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',v_user,'Invitación de terminal: '||_code||'. Aceptar: https://todocerca.mx/terminal-invitacion?token='||inv.token,false); END IF;
 RETURN inv.token; END $$;
REVOKE ALL ON FUNCTION public.terminal_register_scoped(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_register_scoped(text,text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.terminal_invite_phone(_phone text,_code text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.terminal_register_scoped(_phone,_code,NULL); $$;
CREATE OR REPLACE FUNCTION public.terminal_invite_sucursal(_phone text,_negocio uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.terminal_register_scoped(_phone,'collection',_negocio); $$;
CREATE OR REPLACE FUNCTION public.terminal_set_active(_invite_id uuid,_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); inv public.terminal_invites; BEGIN
 IF me IS NULL OR _active IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_invite_id;
 IF inv.id IS NULL OR inv.status<>'accepted' OR inv.invited_user_id IS NULL THEN RAISE EXCEPTION 'Invitación no aceptada'; END IF;
 IF me<>inv.invited_user_id AND me<>inv.merchant_user_id THEN RAISE EXCEPTION 'Sin permiso'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(inv.invited_user_id::text,73));
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_invite_id FOR UPDATE;
 IF inv.status<>'accepted' THEN RAISE EXCEPTION 'Invitación no aceptada'; END IF;
 IF _active THEN
 IF NOT EXISTS(SELECT 1 FROM public.terminal_catalog WHERE code=inv.terminal_code AND operational) THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
 IF NOT public.terminal_merchant_valid(inv.merchant_user_id) OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=inv.merchant_user_id AND sub_index=1 AND estado='activa') THEN RAISE EXCEPTION 'Activa primero la QaRd Empresarial'; END IF;
 UPDATE public.terminal_permissions SET active=false WHERE user_id=inv.invited_user_id;
 UPDATE public.terminal_invites SET active=false WHERE invited_user_id=inv.invited_user_id AND active;
 UPDATE public.terminal_invites SET active=true WHERE id=inv.id;
 INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by,negocio_id,active,accepted_at) VALUES(inv.invited_user_id,inv.terminal_code,'accepted',inv.merchant_user_id,inv.negocio_id,true,now()) ON CONFLICT(user_id,terminal_code) DO UPDATE SET status='accepted',invited_by=EXCLUDED.invited_by,negocio_id=EXCLUDED.negocio_id,active=true,accepted_at=now();
 ELSE
 IF inv.active THEN UPDATE public.terminal_permissions SET active=false WHERE user_id=inv.invited_user_id AND terminal_code=inv.terminal_code AND invited_by=inv.merchant_user_id AND negocio_id IS NOT DISTINCT FROM inv.negocio_id; END IF;
 UPDATE public.terminal_invites SET active=false WHERE id=inv.id;
 END IF; END $$;
CREATE OR REPLACE FUNCTION public.terminal_revoke_invite(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE inv public.terminal_invites; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_id;
 IF inv.id IS NULL OR inv.merchant_user_id<>auth.uid() THEN RAISE EXCEPTION 'Sin permiso para eliminar este teléfono'; END IF;
 IF inv.invited_user_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(inv.invited_user_id::text,73)); END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_id FOR UPDATE;
 UPDATE public.terminal_invites SET status='revoked',active=false WHERE id=inv.id;
 IF inv.active THEN UPDATE public.terminal_permissions SET status='revoked',active=false,accepted_at=NULL WHERE user_id=inv.invited_user_id AND terminal_code=inv.terminal_code AND invited_by=inv.merchant_user_id AND negocio_id IS NOT DISTINCT FROM inv.negocio_id; END IF;
 END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_negocios;