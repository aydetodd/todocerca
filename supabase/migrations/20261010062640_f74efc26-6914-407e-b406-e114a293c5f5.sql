CREATE OR REPLACE FUNCTION public.get_aforo_colectivo()
RETURNS TABLE(user_id uuid, a_bordo int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (ce.user_id) ce.user_id, COALESCE(v.pasajeros_a_bordo,0)::int
  FROM public.viajes_realizados v
  JOIN public.choferes_empresa ce ON ce.id = v.chofer_id
  JOIN public.productos p ON p.id = v.producto_id
  WHERE v.estado = 'en_curso' AND p.route_type = 'taxi_colectivo'
    AND ce.user_id IS NOT NULL AND v.created_at > now() - interval '1 day'
  ORDER BY ce.user_id, v.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.get_aforo_colectivo() TO anon, authenticated;