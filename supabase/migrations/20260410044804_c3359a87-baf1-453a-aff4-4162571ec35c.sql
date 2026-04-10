
CREATE TABLE public.notas_contrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos_transporte(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL,
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('concesionario', 'empresa')),
  tipo_nota text NOT NULL DEFAULT 'general' CHECK (tipo_nota IN ('unidades', 'choferes', 'rutas', 'horarios', 'general')),
  contenido text NOT NULL,
  leido_contraparte boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notas_contrato ENABLE ROW LEVEL SECURITY;

-- Función para verificar si el usuario es parte del contrato
CREATE OR REPLACE FUNCTION public.is_parte_contrato(p_contrato_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM contratos_transporte ct
    JOIN proveedores p ON p.id = ct.concesionario_id
    WHERE ct.id = p_contrato_id AND p.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM contratos_transporte ct
    JOIN empresas_transporte e ON e.id = ct.empresa_id
    WHERE ct.id = p_contrato_id AND e.user_id = p_user_id
  );
$$;

-- Lectura: solo partes del contrato
CREATE POLICY "Partes del contrato pueden ver notas"
  ON public.notas_contrato FOR SELECT
  USING (public.is_parte_contrato(contrato_id, auth.uid()));

-- Inserción: solo partes del contrato
CREATE POLICY "Partes del contrato pueden crear notas"
  ON public.notas_contrato FOR INSERT
  WITH CHECK (public.is_parte_contrato(contrato_id, auth.uid()) AND autor_id = auth.uid());

-- Actualización: solo marcar leído (la contraparte)
CREATE POLICY "Contraparte puede marcar leído"
  ON public.notas_contrato FOR UPDATE
  USING (public.is_parte_contrato(contrato_id, auth.uid()) AND autor_id != auth.uid());

CREATE INDEX idx_notas_contrato_contrato ON public.notas_contrato(contrato_id, created_at DESC);
