
CREATE TABLE public.recursos_contrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos_transporte(id) ON DELETE CASCADE,
  tipo_recurso text NOT NULL CHECK (tipo_recurso IN ('unidad', 'chofer', 'ruta')),
  recurso_id uuid NOT NULL,
  nombre_recurso text NOT NULL,
  detalle text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  solicitado_por uuid NOT NULL,
  aprobado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contrato_id, tipo_recurso, recurso_id)
);

ALTER TABLE public.recursos_contrato ENABLE ROW LEVEL SECURITY;

-- Lectura: solo partes del contrato
CREATE POLICY "Partes del contrato pueden ver recursos"
  ON public.recursos_contrato FOR SELECT
  USING (public.is_parte_contrato(contrato_id, auth.uid()));

-- Inserción: solo concesionario del contrato
CREATE POLICY "Concesionario puede solicitar recursos"
  ON public.recursos_contrato FOR INSERT
  WITH CHECK (
    public.is_parte_contrato(contrato_id, auth.uid())
    AND solicitado_por = auth.uid()
  );

-- Actualización: empresa puede aprobar/rechazar, concesionario puede reenviar (cambiar rechazado a pendiente)
CREATE POLICY "Partes pueden actualizar recursos"
  ON public.recursos_contrato FOR UPDATE
  USING (public.is_parte_contrato(contrato_id, auth.uid()));

-- Eliminación: solo concesionario
CREATE POLICY "Concesionario puede eliminar recursos"
  ON public.recursos_contrato FOR DELETE
  USING (solicitado_por = auth.uid());

CREATE INDEX idx_recursos_contrato_lookup ON public.recursos_contrato(contrato_id, estado);
CREATE INDEX idx_recursos_contrato_recurso ON public.recursos_contrato(recurso_id, tipo_recurso);

-- Trigger para updated_at
CREATE TRIGGER update_recursos_contrato_updated_at
  BEFORE UPDATE ON public.recursos_contrato
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
