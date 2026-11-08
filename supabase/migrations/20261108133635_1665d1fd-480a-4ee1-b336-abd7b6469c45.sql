DO $$
DECLARE orig public.qard_movimientos%ROWTYPE; receipt public.qard_movimientos%ROWTYPE; blocked boolean := false;
BEGIN
 SELECT * INTO orig FROM public.qard_movimientos WHERE tipo='cobro_comercio' AND direccion='salida' AND abs(monto_mxn)>=0.01 ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No hay movimiento real para comprobar el contrato'; END IF;
 BEGIN
  INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues) VALUES(orig.wallet_id,orig.titular_user_id,orig.sub_qr_id,'devolucion',0.01,orig.saldo_despues);
 EXCEPTION WHEN raise_exception THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Prueba fallida: aceptó devolución sin original'; END IF;
 BEGIN
  INSERT INTO public.qard_movimientos(wallet_id,titular_user_id,sub_qr_id,tipo,monto_mxn,saldo_despues,metadata) VALUES(orig.wallet_id,orig.titular_user_id,orig.sub_qr_id,'devolucion',0.01,orig.saldo_despues,jsonb_build_object('original_movimiento_id',orig.id)) RETURNING * INTO receipt;
  IF receipt.monto_mxn<>-0.01 OR receipt.direccion<>'entrada' OR receipt.metadata->>'status'<>'completed' OR receipt.descripcion IS DISTINCT FROM 'Devolución del folio original: '||(receipt.metadata->>'original_folio') OR receipt.metadata->>'original_movimiento_id' IS DISTINCT FROM orig.id::text THEN RAISE EXCEPTION 'Prueba fallida: contrato devolución'; END IF;
  RAISE SQLSTATE 'ZX001' USING MESSAGE='rollback successful test';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $$;