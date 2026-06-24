
CREATE TABLE IF NOT EXISTS public.unidad_geocercas_cobro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id uuid NOT NULL REFERENCES public.unidades_empresa(id) ON DELETE CASCADE,
  sentido text NOT NULL CHECK (sentido IN ('ida','vuelta')),
  orden int NOT NULL DEFAULT 0,
  nombre text NOT NULL DEFAULT 'Zona',
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  radio_m int NOT NULL DEFAULT 200 CHECK (radio_m BETWEEN 50 AND 1500),
  precio_mxn numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ugc_unidad_sentido ON public.unidad_geocercas_cobro(unidad_id, sentido, orden);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidad_geocercas_cobro TO authenticated;
GRANT ALL ON public.unidad_geocercas_cobro TO service_role;

ALTER TABLE public.unidad_geocercas_cobro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_ugc" ON public.unidad_geocercas_cobro
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.unidades_empresa u
    WHERE u.id = unidad_geocercas_cobro.unidad_id
      AND public.is_proveedor_owner(u.proveedor_id, auth.uid())
  ));

CREATE POLICY "owner_write_ugc" ON public.unidad_geocercas_cobro
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.unidades_empresa u
    WHERE u.id = unidad_geocercas_cobro.unidad_id
      AND public.is_proveedor_owner(u.proveedor_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.unidades_empresa u
    WHERE u.id = unidad_geocercas_cobro.unidad_id
      AND public.is_proveedor_owner(u.proveedor_id, auth.uid())
  ));

CREATE TRIGGER trg_ugc_updated_at BEFORE UPDATE ON public.unidad_geocercas_cobro
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: reemplaza atómicamente todas las zonas de un sentido
CREATE OR REPLACE FUNCTION public.rpc_unidad_set_geocercas_cobro(
  _unidad_id uuid,
  _sentido text,
  _zonas jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean;
  _count int := 0;
  _zona jsonb;
  _orden int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  IF _sentido NOT IN ('ida','vuelta') THEN
    RAISE EXCEPTION 'Sentido inválido';
  END IF;

  SELECT public.is_proveedor_owner(u.proveedor_id, auth.uid()) INTO _is_owner
  FROM public.unidades_empresa u WHERE u.id = _unidad_id;
  IF NOT COALESCE(_is_owner, false) THEN
    RAISE EXCEPTION 'No autorizado para esta unidad';
  END IF;

  DELETE FROM public.unidad_geocercas_cobro
  WHERE unidad_id = _unidad_id AND sentido = _sentido;

  IF _zonas IS NOT NULL AND jsonb_typeof(_zonas) = 'array' THEN
    FOR _zona IN SELECT * FROM jsonb_array_elements(_zonas) LOOP
      INSERT INTO public.unidad_geocercas_cobro(
        unidad_id, sentido, orden, nombre, lat, lng, radio_m, precio_mxn
      ) VALUES (
        _unidad_id,
        _sentido,
        _orden,
        COALESCE(NULLIF(btrim(_zona->>'nombre'), ''), 'Zona ' || (_orden+1)::text),
        (_zona->>'lat')::numeric,
        (_zona->>'lng')::numeric,
        GREATEST(50, LEAST(1500, COALESCE((_zona->>'radio_m')::int, 200))),
        GREATEST(0, COALESCE((_zona->>'precio_mxn')::numeric, 0))
      );
      _orden := _orden + 1;
      _count := _count + 1;
    END LOOP;
  END IF;

  RETURN _count;
END;
$$;
