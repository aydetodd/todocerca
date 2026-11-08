CREATE OR REPLACE FUNCTION public.qard_validate_refund_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE original jsonb; original_id uuid; original_folio text; refunded numeric; incoming boolean;
BEGIN
 IF NEW.tipo NOT IN ('devolucion','reembolso','refund') THEN RETURN NEW; END IF;
 NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb);
 BEGIN
  original_id := nullif(NEW.metadata->>'original_movimiento_id','')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Movimiento original inválido'; END;
 IF original_id IS NULL AND NEW.metadata ? 'pago_servicio_id' THEN
  SELECT movimiento_id INTO original_id FROM public.qard_pagos_servicio WHERE id=(NEW.metadata->>'pago_servicio_id')::uuid AND wallet_id=NEW.wallet_id AND user_id=NEW.titular_user_id;
 END IF;
 IF original_id IS NULL OR original_id=NEW.id THEN RAISE EXCEPTION 'La devolución requiere el movimiento original'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(original_id::text, 481));
 SELECT to_jsonb(m) INTO original FROM public.qard_movimientos m WHERE m.id=original_id;
 IF original IS NULL THEN SELECT a.data INTO original FROM public.qard_movimientos_archivo a WHERE a.movimiento_id=original_id; END IF;
 IF original IS NULL OR original->>'wallet_id' IS DISTINCT FROM NEW.wallet_id::text OR original->>'titular_user_id' IS DISTINCT FROM NEW.titular_user_id::text OR original->>'sub_qr_id' IS DISTINCT FROM NEW.sub_qr_id::text THEN RAISE EXCEPTION 'El movimiento original no corresponde a esta cuenta'; END IF;
 IF original->>'tipo' IN ('devolucion','reembolso','refund','transfer_a_sub','transfer_desde_sub','comision') THEN RAISE EXCEPTION 'Este movimiento no admite devolución'; END IF;
 IF coalesce(NEW.monto_mxn,0)=0 THEN RAISE EXCEPTION 'Importe de devolución inválido'; END IF;
 SELECT coalesce(sum(abs(m.monto_mxn)),0) INTO refunded FROM public.qard_movimientos m WHERE m.tipo='devolucion' AND m.metadata->>'original_movimiento_id'=original_id::text;
 SELECT refunded+coalesce(sum(abs((a.data->>'monto_mxn')::numeric)),0) INTO refunded FROM public.qard_movimientos_archivo a WHERE a.data->>'tipo'='devolucion' AND a.data->'metadata'->>'original_movimiento_id'=original_id::text AND NOT EXISTS(SELECT 1 FROM public.qard_movimientos m WHERE m.id=a.movimiento_id);
 IF refunded+abs(NEW.monto_mxn)>abs((original->>'monto_mxn')::numeric) THEN RAISE EXCEPTION 'La devolución supera el importe original pendiente'; END IF;
 original_folio := 'QRD-'||to_char((original->>'created_at')::timestamptz AT TIME ZONE 'America/Hermosillo','YYYYMMDD')||'-'||upper(left(replace(coalesce(nullif(original->'metadata'->>'operation_key',''),original_id::text),'-',''),6));
 incoming := original->>'direccion'='salida';
 NEW.tipo:='devolucion'; NEW.monto_mxn:=-abs(NEW.monto_mxn);
 NEW.ambito:=original->>'ambito'; NEW.direccion:=CASE WHEN incoming THEN 'entrada' ELSE 'salida' END;
 NEW.descripcion:='Devolución del folio original: '||original_folio;
 NEW.metadata:=NEW.metadata||jsonb_build_object('original_movimiento_id',original_id,'original_folio',original_folio,'status','completed','refund_received',incoming);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.qard_validate_refund_reference() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_validate_refund_reference() TO service_role;
CREATE TRIGGER zz_qard_refund_reference BEFORE INSERT ON public.qard_movimientos FOR EACH ROW EXECUTE FUNCTION public.qard_validate_refund_reference();