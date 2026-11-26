ALTER FUNCTION qard_private.qard_documento_fuente(text,integer,text) STABLE;
ALTER FUNCTION qard_private.qard_documento_fuente(text,integer,text) RENAME TO qard_documento_fuente_base;
REVOKE ALL ON FUNCTION qard_private.qard_documento_fuente_base(text,integer,text) FROM authenticated,anon,PUBLIC;
CREATE FUNCTION qard_private.qard_documento_fuente(_qard text,_days integer,_savings_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; item jsonb; enriched jsonb:='[]'; counterpart text; uid uuid:=auth.uid();
BEGIN
 result:=qard_private.qard_documento_fuente_base(_qard,_days,_savings_token);
 FOR item IN SELECT value FROM jsonb_array_elements(result->'movements') LOOP
  counterpart:=NULL;
  IF coalesce(item->'metadata'->>'operation_key','')<>'' THEN
   SELECT s.qard_number INTO counterpart FROM public.qard_movimientos m JOIN public.qard_sub_qr s ON s.titular_user_id=m.titular_user_id AND s.sub_index=CASE WHEN m.sub_qr_id IS NULL THEN 0 ELSE (SELECT sub_index FROM public.qard_sub_qr WHERE id=m.sub_qr_id) END
    WHERE m.titular_user_id<>uid AND m.metadata->>'operation_key'=item->'metadata'->>'operation_key'
    AND m.tipo IN('cobro_comercio','cobro_recibido','transferencia_p2p_in','transferencia_p2p_out','bono_recibido','bono_pago','devolucion','refund','reembolso') ORDER BY m.created_at LIMIT 1;
  END IF;
  IF counterpart IS NOT NULL THEN item:=jsonb_set(item,'{metadata}',coalesce(nullif(item->'metadata','null'::jsonb),'{}'::jsonb)||jsonb_build_object('counterparty_qard',counterpart)); END IF;
  enriched:=enriched||jsonb_build_array(item);
 END LOOP;
 RETURN jsonb_set(result,'{movements}',enriched);
END $$;
REVOKE ALL ON FUNCTION qard_private.qard_documento_fuente(text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION qard_private.qard_documento_fuente(text,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.qard_documento_fuente(_qard text,_days integer,_savings_token text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT qard_private.qard_documento_fuente(_qard,_days,_savings_token) $$;