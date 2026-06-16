
-- Puntos A y B + radio para conteo automático de viajes
ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS punto_a_lat numeric,
  ADD COLUMN IF NOT EXISTS punto_a_lng numeric,
  ADD COLUMN IF NOT EXISTS punto_b_lat numeric,
  ADD COLUMN IF NOT EXISTS punto_b_lng numeric,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer DEFAULT 150;

-- Origen/destino del viaje
ALTER TABLE public.viajes_realizados
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS destino text;

-- RPC: el concesionario guarda los puntos A y B de UNA unidad
CREATE OR REPLACE FUNCTION public.rpc_unidad_set_puntos_ab(
  _unidad_id uuid,
  _a_lat numeric,
  _a_lng numeric,
  _b_lat numeric,
  _b_lng numeric,
  _radio integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  UPDATE public.unidades_empresa u
  SET punto_a_lat = _a_lat,
      punto_a_lng = _a_lng,
      punto_b_lat = _b_lat,
      punto_b_lng = _b_lng,
      geofence_radius_m = GREATEST(50, LEAST(1000, COALESCE(_radio, 150))),
      updated_at = now()
  WHERE u.id = _unidad_id
    AND public.is_proveedor_owner(u.proveedor_id, auth.uid())
  RETURNING u.id INTO _updated;

  IF _updated IS NULL THEN
    RAISE EXCEPTION 'No se guardó: la unidad no es tuya';
  END IF;

  RETURN _updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_unidad_set_puntos_ab(uuid, numeric, numeric, numeric, numeric, integer) TO authenticated;
