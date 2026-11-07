DO $patch$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE proname='terminal_reload';
 body:=replace(body,'w.saldo_mxn','w.saldo_comercio_mxn');
 body:=replace(body,'SET saldo_mxn=saldo_mxn-_amount+5 WHERE id=w.id RETURNING saldo_mxn','SET saldo_comercio_mxn=saldo_comercio_mxn-_amount+5 WHERE id=w.id RETURNING saldo_comercio_mxn');
 body:=replace(body,$old$jsonb_build_object('terminal','reload','operation_key',_key,'comerciante_id',owner$old$, $new$jsonb_build_object('bolsa','comercio','terminal','reload','operation_key',_key,'comerciante_id',owner$new$);
 EXECUTE body;
END $patch$;
COMMENT ON FUNCTION public.terminal_reload(text,numeric,uuid) IS 'Intentional authenticated SECURITY DEFINER: active invited operator debits only merchant enterprise funds, atomic receipt and unchanged 15/5/10 fees.';
-- Internal family allocations cannot bypass business balance isolation.
DO $patch$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE proname='qard_transferir_a_sub';
 body:=replace(body,$old$IF _sub.sub_index = 0 THEN$old$, $new$IF _sub.sub_index = 1 THEN RAISE EXCEPTION 'Usa Transferencias con CVV dinámico para la QaRd Empresarial'; END IF; IF _sub.sub_index = 0 THEN$new$);
 EXECUTE body;
END $patch$;