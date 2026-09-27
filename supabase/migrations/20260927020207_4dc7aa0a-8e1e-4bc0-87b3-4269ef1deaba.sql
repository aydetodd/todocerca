-- Solo service_role
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.stp_procesar_deposito(text,numeric,text,text,text,text,text,jsonb)',
    'public.stp_tope_mensual(uuid)',
    'public.qard_aplicar_recarga(uuid,numeric,text,text,jsonb)',
    'public.qard_cobrar_comision(uuid,commission_type,numeric,numeric,numeric,text,text,text)',
    'public.qard_comision_retiro(uuid,numeric,text)',
    'public.qard_verificar_sub_qr(uuid,uuid,text,text,text)',
    'public.qard_dec(text)',
    'public.qard_enc(text)',
    'public.gen_cvv3()',
    'public.gen_cvv4()',
    'public.qard_cvv_verificar(text,text,text)',
    'public.qard_pagar_servicio(uuid,uuid,text,numeric,text)',
    'public.qard_revertir_pago_servicio(uuid,text)',
    'public.qard_purge_movimientos_antiguos()',
    'public.qard_ensure_number(uuid)',
    'public.qard_finalize_registration(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  -- Usadas por la app con sesión: fuera anónimos
  FOREACH f IN ARRAY ARRAY[
    'public.qard_transfer_p2p(text,text,text,numeric)',
    'public.qard_transferir_a_sub(uuid,numeric)',
    'public.qard_sub_qr_rotar_cvv(uuid,text)',
    'public.qard_sub_set_estado(uuid,text)',
    'public.qard_pasar_cobros_a_eje(numeric)',
    'public.qard_mis_cvv()',
    'public.admin_pin_estado()',
    'public.admin_pin_set(text,text)',
    'public.admin_pin_verify(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- El trigger de cifrado de CVV llama a qard_enc: que corra como dueño
ALTER FUNCTION public.tg_set_cvv_default() SECURITY DEFINER SET search_path = public;