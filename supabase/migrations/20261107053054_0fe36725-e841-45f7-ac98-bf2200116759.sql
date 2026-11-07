CREATE OR REPLACE FUNCTION public.terminal_invite_phone(_phone text,_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE me uuid:=auth.uid(); v_token uuid; v_phone text; v_user uuid; inv public.terminal_invites; BEGIN
 IF me IS NULL OR NOT public.terminal_merchant_valid(me) OR NOT EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=me AND sub_index=1 AND estado='activa') THEN RAISE EXCEPTION 'Activa primero tu QaRd Empresarial'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.terminal_catalog WHERE code=_code AND operational) THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
 v_phone:=coalesce(public.normalize_phone(_phone),''); IF length(v_phone)<10 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE merchant_user_id=me AND phone=v_phone AND terminal_code=_code FOR UPDATE;
 IF FOUND AND inv.status='accepted' THEN RAISE EXCEPTION 'Este teléfono ya está registrado. Usa su interruptor'; END IF;
 IF inv.id IS NULL THEN INSERT INTO public.terminal_invites(merchant_user_id,phone,terminal_code) VALUES(me,v_phone,_code) RETURNING token INTO v_token;
 ELSE UPDATE public.terminal_invites SET status='pending',active=false,invited_user_id=NULL,accepted_at=NULL WHERE id=inv.id RETURNING token INTO v_token; END IF;
 SELECT user_id INTO v_user FROM public.profiles WHERE public.terminal_phone_matches(telefono,v_phone) LIMIT 1;
 IF v_user=me THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(me::text,73));
  UPDATE public.terminal_invites SET status='accepted',invited_user_id=me,accepted_at=now(),active=false WHERE merchant_user_id=me AND phone=v_phone AND terminal_code=_code;
  INSERT INTO public.terminal_permissions(user_id,terminal_code,status,invited_by,active) VALUES(me,_code,'accepted',me,false) ON CONFLICT(user_id,terminal_code) DO NOTHING;
 ELSIF v_user IS NOT NULL THEN INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',v_user,'Invitación de terminal: '||_code||'. Aceptar: https://todocerca.mx/terminal-invitacion?token='||v_token,false); END IF;
 RETURN v_token; END $$;
CREATE OR REPLACE FUNCTION public.terminal_revoke_invite(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE inv public.terminal_invites; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 SELECT * INTO inv FROM public.terminal_invites WHERE id=_id FOR UPDATE;
 IF inv.id IS NULL OR inv.merchant_user_id<>auth.uid() THEN RAISE EXCEPTION 'Sin permiso para eliminar este teléfono'; END IF;
 IF inv.invited_user_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(inv.invited_user_id::text,73)); END IF;
 UPDATE public.terminal_invites SET status='revoked',active=false WHERE id=inv.id;
 UPDATE public.terminal_permissions SET status='revoked',active=false,accepted_at=NULL WHERE user_id=inv.invited_user_id AND terminal_code=inv.terminal_code AND invited_by=inv.merchant_user_id;
 END $$;
COMMENT ON FUNCTION public.terminal_invite_phone(text,text) IS 'Intentional authenticated SECURITY DEFINER: only active verified business owner invites phones; internal notification or WhatsApp, self-registration inactive and never overwrites an active terminal.';
COMMENT ON FUNCTION public.terminal_revoke_invite(uuid) IS 'Intentional authenticated SECURITY DEFINER: only inviting merchant revokes a specific phone registration and immediately disables matching access.';