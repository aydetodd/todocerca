CREATE OR REPLACE FUNCTION public.rpc_aforo_manual(_viaje_id uuid, _delta int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.viajes_realizados%ROWTYPE; v_new int;
BEGIN
  IF _delta NOT IN (-1, 1) THEN RETURN jsonb_build_object('ok',false,'error','Movimiento inválido'); END IF;
  SELECT * INTO v FROM public.viajes_realizados WHERE id = _viaje_id;
  IF v.id IS NULL OR NOT public.is_chofer_self(v.chofer_id, auth.uid()) THEN
    RETURN jsonb_build_object('ok',false,'error','Sin permiso');
  END IF;
  IF v.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no está en curso'); END IF;
  v_new := COALESCE(v.pasajeros_a_bordo,0) + _delta;
  IF v_new < 0 THEN RETURN jsonb_build_object('ok',false,'error','Ya no hay pasajeros a bordo'); END IF;
  IF v_new > 4 THEN RETURN jsonb_build_object('ok',false,'error','Lleno: 4 de 4'); END IF;
  UPDATE public.viajes_realizados SET
    pasajeros_a_bordo = v_new,
    pasajeros_subidos = COALESCE(pasajeros_subidos,0) + GREATEST(_delta,0),
    pasajeros_bajados = COALESCE(pasajeros_bajados,0) + GREATEST(-_delta,0)
  WHERE id = _viaje_id;
  RETURN jsonb_build_object('ok',true,'a_bordo',v_new);
END $$;
REVOKE ALL ON FUNCTION public.rpc_aforo_manual(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_aforo_manual(uuid,int) TO authenticated;