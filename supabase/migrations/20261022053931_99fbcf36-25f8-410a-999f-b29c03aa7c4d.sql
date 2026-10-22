CREATE FUNCTION public.terminal_reload_quote(_number text,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE target uuid; pending boolean; opening numeric:=0; BEGIN
 IF auth.uid() IS NULL OR NOT public.terminal_has_access(auth.uid(),'reload') THEN RAISE EXCEPTION 'Terminal pendiente de autorización'; END IF;
 IF _number !~ '^[0-9]{16}$' OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 SELECT s.titular_user_id,i.account_opening_fee_pending INTO target,pending FROM public.qard_sub_qr s JOIN public.qard_identidad i ON i.user_id=s.titular_user_id WHERE s.qard_number=_number AND s.sub_index=0 AND s.estado='activa' AND i.estado IN ('active','moral_approved');
 IF target IS NULL OR target=auth.uid() THEN RAISE EXCEPTION 'Usa la QaRd principal de un cliente'; END IF;
 IF COALESCE(pending,true) THEN opening:=150; END IF;
 IF _amount-opening-15<=0 THEN RAISE EXCEPTION 'El monto debe superar $%',opening+15; END IF;
 RETURN jsonb_build_object('opening',opening,'net',_amount-opening-15,'merchant',5,'platform',10,'fee',15); END; $$;
REVOKE ALL ON FUNCTION public.terminal_reload_quote(text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.terminal_reload_quote(text,numeric) TO authenticated;
COMMENT ON FUNCTION public.terminal_reload_quote(text,numeric) IS 'Reviewed intentional authenticated SECURITY DEFINER: fully verified own terminal required; only fee quote, no customer balance/history.';