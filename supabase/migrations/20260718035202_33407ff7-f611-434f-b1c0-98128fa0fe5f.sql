
-- 1) Tabla de waypoints
CREATE TABLE IF NOT EXISTS public.unidad_viaje_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id UUID NOT NULL REFERENCES public.unidades_empresa(id) ON DELETE CASCADE,
  orden INT NOT NULL CHECK (orden >= 1),
  label TEXT NOT NULL DEFAULT '',
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  radio_m INT NOT NULL DEFAULT 150 CHECK (radio_m BETWEEN 30 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unidad_id, orden)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidad_viaje_waypoints TO authenticated;
GRANT ALL ON public.unidad_viaje_waypoints TO service_role;

ALTER TABLE public.unidad_viaje_waypoints ENABLE ROW LEVEL SECURITY;

-- Concesionario dueño lee/escribe
CREATE POLICY "Dueño concesionario gestiona waypoints"
ON public.unidad_viaje_waypoints
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.unidades_empresa ue
    JOIN public.proveedores pr ON pr.id = ue.proveedor_id
    WHERE ue.id = unidad_viaje_waypoints.unidad_id
      AND pr.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.unidades_empresa ue
    JOIN public.proveedores pr ON pr.id = ue.proveedor_id
    WHERE ue.id = unidad_viaje_waypoints.unidad_id
      AND pr.user_id = auth.uid()
  )
);

-- Choferes activos de esa unidad leen
CREATE POLICY "Choferes activos leen waypoints"
ON public.unidad_viaje_waypoints
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.choferes_empresa ce
    JOIN public.unidades_empresa ue ON ue.proveedor_id = ce.proveedor_id
    WHERE ue.id = unidad_viaje_waypoints.unidad_id
      AND ce.user_id = auth.uid()
      AND ce.is_active = true
  )
);

CREATE INDEX IF NOT EXISTS idx_waypoints_unidad_orden ON public.unidad_viaje_waypoints(unidad_id, orden);

CREATE TRIGGER trg_waypoints_updated_at
BEFORE UPDATE ON public.unidad_viaje_waypoints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) viaje_tipo en unidades
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='unidades_empresa' AND column_name='viaje_tipo'
  ) THEN
    ALTER TABLE public.unidades_empresa ADD COLUMN viaje_tipo TEXT NOT NULL DEFAULT 'sencillo'
      CHECK (viaje_tipo IN ('sencillo','redondo'));
  END IF;
END $$;

-- 3) waypoint_orden_actual en viajes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='viajes_realizados' AND column_name='waypoint_orden_actual'
  ) THEN
    ALTER TABLE public.viajes_realizados ADD COLUMN waypoint_orden_actual INT;
  END IF;
END $$;

-- 4) Seed: migrar A/B existentes a waypoints
INSERT INTO public.unidad_viaje_waypoints (unidad_id, orden, label, lat, lng, radio_m)
SELECT ue.id, 1, 'A - Origen', ue.punto_a_lat, ue.punto_a_lng, COALESCE(ue.geofence_radius_m, 150)
FROM public.unidades_empresa ue
WHERE ue.punto_a_lat IS NOT NULL AND ue.punto_a_lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.unidad_viaje_waypoints w WHERE w.unidad_id = ue.id AND w.orden = 1);

INSERT INTO public.unidad_viaje_waypoints (unidad_id, orden, label, lat, lng, radio_m)
SELECT ue.id, 2, 'B - Destino', ue.punto_b_lat, ue.punto_b_lng, COALESCE(ue.geofence_radius_m, 150)
FROM public.unidades_empresa ue
WHERE ue.punto_b_lat IS NOT NULL AND ue.punto_b_lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.unidad_viaje_waypoints w WHERE w.unidad_id = ue.id AND w.orden = 2);

-- 5) RPC para guardar waypoints en bloque
CREATE OR REPLACE FUNCTION public.rpc_unidad_set_waypoints(
  _unidad_id UUID,
  _viaje_tipo TEXT,
  _waypoints JSONB
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT;
  _item JSONB;
  _idx INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.unidades_empresa ue
    JOIN public.proveedores pr ON pr.id = ue.proveedor_id
    WHERE ue.id = _unidad_id AND pr.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Esta unidad no te pertenece';
  END IF;

  IF _viaje_tipo NOT IN ('sencillo','redondo') THEN
    RAISE EXCEPTION 'viaje_tipo inválido';
  END IF;

  IF jsonb_typeof(_waypoints) <> 'array' OR jsonb_array_length(_waypoints) < 2 THEN
    RAISE EXCEPTION 'Debes registrar al menos 2 puntos';
  END IF;

  DELETE FROM public.unidad_viaje_waypoints WHERE unidad_id = _unidad_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_waypoints)
  LOOP
    _idx := _idx + 1;
    INSERT INTO public.unidad_viaje_waypoints (unidad_id, orden, label, lat, lng, radio_m)
    VALUES (
      _unidad_id,
      _idx,
      COALESCE(NULLIF(btrim(_item->>'label'), ''), 'Punto ' || _idx),
      (_item->>'lat')::NUMERIC,
      (_item->>'lng')::NUMERIC,
      GREATEST(30, LEAST(100000, COALESCE((_item->>'radio_m')::INT, 150)))
    );
  END LOOP;

  -- Sincronizar columnas legacy A/B con los primeros 2 puntos (compat)
  UPDATE public.unidades_empresa
  SET viaje_tipo = _viaje_tipo,
      punto_a_lat = ((_waypoints->0)->>'lat')::NUMERIC,
      punto_a_lng = ((_waypoints->0)->>'lng')::NUMERIC,
      punto_b_lat = ((_waypoints->1)->>'lat')::NUMERIC,
      punto_b_lng = ((_waypoints->1)->>'lng')::NUMERIC,
      geofence_radius_m = GREATEST(30, LEAST(100000, COALESCE(((_waypoints->0)->>'radio_m')::INT, 150))),
      updated_at = now()
  WHERE id = _unidad_id;

  SELECT COUNT(*) INTO _count FROM public.unidad_viaje_waypoints WHERE unidad_id = _unidad_id;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_unidad_set_waypoints(UUID, TEXT, JSONB) TO authenticated;
