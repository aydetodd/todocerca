CREATE FUNCTION qard_private.qard_bono_entregar_qard(_lote uuid,_qard text,_monto numeric,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); number00 text:=regexp_replace(_qard,'[[:space:]]','','g'); l public.qard_bono_lotes; recipient public.qard_sub_qr; s public.qard_sub_qr; prior public.qard_bono_entregas;
BEGIN
IF me IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) OR _key IS NULL OR _lote IS NULL OR _monto IS NULL OR _monto<=0 OR _monto<>round(_monto,2) THEN RAISE EXCEPTION 'Revisa lote y monto'; END IF;
IF number00 IS NULL OR number00 !~ '^\d{14}00$' THEN RAISE EXCEPTION 'Ingresa los 16 dígitos de la QaRd Personal terminada en 00'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,9));
SELECT * INTO l FROM public.qard_bono_lotes WHERE id=_lote AND empresa_user_id=me FOR UPDATE;
IF l.id IS NULL THEN RAISE EXCEPTION 'Lote no disponible'; END IF;
SELECT * INTO recipient FROM public.qard_sub_qr WHERE qard_number=number00 AND sub_index=0;
IF recipient.id IS NULL THEN RAISE EXCEPTION 'QaRd Personal 00 no encontrada'; END IF;
SELECT * INTO prior FROM public.qard_bono_entregas WHERE operation_key=_key;
IF prior.id IS NOT NULL THEN
IF prior.empresa_user_id<>me OR prior.lote_id<>_lote OR prior.monto<>_monto OR prior.empleado_user_id<>recipient.titular_user_id THEN RAISE EXCEPTION 'Operación usada con otros datos'; END IF;
RETURN jsonb_build_object('ok',true,'repetida',true); END IF;
IF l.saldo_disponible<_monto THEN RAISE EXCEPTION 'El lote no tiene suficiente'; END IF;
PERFORM 1 FROM public.qard_wallets WHERE id=recipient.wallet_id FOR UPDATE;
s:=public.qard_ensure_bono(recipient.wallet_id,l.categoria);
SELECT * INTO s FROM public.qard_sub_qr WHERE id=s.id FOR UPDATE;
PERFORM set_config('qard.bono_op','1',true);
UPDATE public.qard_sub_qr SET saldo_mxn=saldo_mxn+_monto WHERE id=s.id RETURNING * INTO s;
PERFORM set_config('qard.bono_op','',true);
UPDATE public.qard_bono_lotes SET saldo_disponible=saldo_disponible-_monto WHERE id=l.id;
INSERT INTO public.qard_bono_entregas(lote_id,empresa_user_id,empleado_user_id,monto,operation_key) VALUES(l.id,me,recipient.titular_user_id,_monto,_key);
INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,comercio_user_id,descripcion,metadata)
VALUES(recipient.wallet_id,recipient.titular_user_id,s.id,'bono_recibido',_monto,s.saldo_mxn,me,'Bono recibido de tu empresa',jsonb_build_object('categoria',l.categoria,'operation_key',_key,'lote',l.id,'folio_factura',l.folio_factura));
INSERT INTO public.messages(sender_id,receiver_id,message,is_read) VALUES('00000000-0000-0000-0000-000000000001',recipient.titular_user_id,format('QaRd: recibiste $%s en %s. Saldo del bono: $%s.',_monto,s.alias,s.saldo_mxn),false);
RETURN jsonb_build_object('ok',true,'saldo',s.saldo_mxn,'terminacion',s.sub_index); END $$;
CREATE FUNCTION public.qard_bono_entregar_qard(_lote uuid,_qard text,_monto numeric,_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_bono_entregar_qard(_lote,_qard,_monto,_key) $$;
REVOKE ALL ON FUNCTION qard_private.qard_bono_entregar_qard(uuid,text,numeric,uuid),public.qard_bono_entregar_qard(uuid,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_bono_entregar_qard(uuid,text,numeric,uuid),public.qard_bono_entregar_qard(uuid,text,numeric,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.qard_bono_entregar(uuid,text,numeric,uuid) FROM PUBLIC,anon,authenticated;