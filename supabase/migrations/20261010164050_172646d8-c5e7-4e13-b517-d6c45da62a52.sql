ALTER TABLE public.unidades_empresa ADD COLUMN IF NOT EXISTS capacidad_pasajeros int NOT NULL DEFAULT 4;
DROP FUNCTION IF EXISTS public.get_aforo_colectivo();
CREATE FUNCTION public.get_aforo_colectivo()
RETURNS TABLE(user_id uuid, a_bordo int, capacidad int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (ce.user_id) ce.user_id, COALESCE(v.pasajeros_a_bordo,0)::int,
    GREATEST(1, LEAST(20, COALESCE(u.capacidad_pasajeros,4)))::int
  FROM public.viajes_realizados v
  JOIN public.choferes_empresa ce ON ce.id = v.chofer_id
  JOIN public.productos p ON p.id = v.producto_id
  LEFT JOIN public.unidades_empresa u ON u.id = v.unidad_id
  WHERE v.estado = 'en_curso' AND p.route_type = 'taxi_colectivo'
    AND ce.user_id IS NOT NULL AND v.created_at > now() - interval '1 day'
  ORDER BY ce.user_id, v.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.get_aforo_colectivo() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_aforo_manual(_viaje_id uuid, _delta int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.viajes_realizados%ROWTYPE; v_new int; v_cap int;
BEGIN
  IF _delta NOT IN (-1, 1) THEN RETURN jsonb_build_object('ok',false,'error','Movimiento inválido'); END IF;
  SELECT * INTO v FROM public.viajes_realizados WHERE id = _viaje_id;
  IF v.id IS NULL OR NOT public.is_chofer_self(v.chofer_id, auth.uid()) THEN
    RETURN jsonb_build_object('ok',false,'error','Sin permiso');
  END IF;
  IF v.estado <> 'en_curso' THEN RETURN jsonb_build_object('ok',false,'error','Viaje no está en curso'); END IF;
  SELECT GREATEST(1, LEAST(20, COALESCE(capacidad_pasajeros,4))) INTO v_cap FROM public.unidades_empresa WHERE id = v.unidad_id;
  v_cap := COALESCE(v_cap, 4);
  v_new := COALESCE(v.pasajeros_a_bordo,0) + _delta;
  IF v_new < 0 THEN RETURN jsonb_build_object('ok',false,'error','Ya no hay pasajeros a bordo'); END IF;
  IF v_new > v_cap THEN RETURN jsonb_build_object('ok',false,'error','Lleno: '||v_cap||' de '||v_cap); END IF;
  UPDATE public.viajes_realizados SET
    pasajeros_a_bordo = v_new,
    pasajeros_subidos = COALESCE(pasajeros_subidos,0) + GREATEST(_delta,0),
    pasajeros_bajados = COALESCE(pasajeros_bajados,0) + GREATEST(-_delta,0)
  WHERE id = _viaje_id;
  RETURN jsonb_build_object('ok',true,'a_bordo',v_new,'capacidad',v_cap);
END $$;
REVOKE ALL ON FUNCTION public.rpc_aforo_manual(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_aforo_manual(uuid,int) TO authenticated;