
ALTER TABLE public.unidad_geocercas_cobro ADD COLUMN IF NOT EXISTS producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE;
ALTER TABLE public.unidad_geocercas_cobro ALTER COLUMN unidad_id DROP NOT NULL;
ALTER TABLE public.unidad_geocercas_cobro DROP CONSTRAINT IF EXISTS unidad_geocercas_cobro_owner_chk;
ALTER TABLE public.unidad_geocercas_cobro ADD CONSTRAINT unidad_geocercas_cobro_owner_chk CHECK ((unidad_id IS NOT NULL) OR (producto_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_ugc_producto ON public.unidad_geocercas_cobro(producto_id, sentido, orden);

DROP POLICY IF EXISTS "Producto owner manages geocercas cobro" ON public.unidad_geocercas_cobro;
CREATE POLICY "Producto owner manages geocercas cobro"
ON public.unidad_geocercas_cobro
FOR ALL
TO authenticated
USING (
  producto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = unidad_geocercas_cobro.producto_id AND pr.user_id = auth.uid()
  )
)
WITH CHECK (
  producto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.productos p
    JOIN public.proveedores pr ON pr.id = p.proveedor_id
    WHERE p.id = unidad_geocercas_cobro.producto_id AND pr.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.rpc_producto_set_geocercas_cobro(
  _producto_id uuid,
  _sentido text,
  _zonas jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_zona jsonb;
  v_orden int := 0;
BEGIN
  IF _sentido NOT IN ('ida','vuelta') THEN
    RAISE EXCEPTION 'sentido invalido: %', _sentido;
  END IF;

  SELECT pr.user_id INTO v_owner
  FROM public.productos p
  JOIN public.proveedores pr ON pr.id = p.proveedor_id
  WHERE p.id = _producto_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM public.unidad_geocercas_cobro
    WHERE producto_id = _producto_id AND sentido = _sentido;

  FOR v_zona IN SELECT * FROM jsonb_array_elements(COALESCE(_zonas, '[]'::jsonb))
  LOOP
    INSERT INTO public.unidad_geocercas_cobro
      (producto_id, sentido, orden, nombre, lat, lng, radio_m, precio_mxn)
    VALUES (
      _producto_id,
      _sentido,
      v_orden,
      COALESCE(v_zona->>'nombre', 'Zona ' || (v_orden+1)::text),
      (v_zona->>'lat')::numeric,
      (v_zona->>'lng')::numeric,
      GREATEST(50, LEAST(1500, COALESCE((v_zona->>'radio_m')::int, 200))),
      GREATEST(0, COALESCE((v_zona->>'precio_mxn')::numeric, 0))
    );
    v_orden := v_orden + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_producto_set_geocercas_cobro(uuid, text, jsonb) TO authenticated;
