
CREATE TABLE public.conteo_pasajeros_alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidad_id UUID NOT NULL REFERENCES public.unidades_empresa(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  puerta_muda TEXT NOT NULL,
  eventos_ventana INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conteo_alertas_unidad_created ON public.conteo_pasajeros_alertas(unidad_id, created_at DESC);

GRANT SELECT ON public.conteo_pasajeros_alertas TO authenticated;
GRANT ALL ON public.conteo_pasajeros_alertas TO service_role;

ALTER TABLE public.conteo_pasajeros_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionario ve sus alertas"
ON public.conteo_pasajeros_alertas
FOR SELECT
TO authenticated
USING (public.is_proveedor_owner(proveedor_id, auth.uid()));
