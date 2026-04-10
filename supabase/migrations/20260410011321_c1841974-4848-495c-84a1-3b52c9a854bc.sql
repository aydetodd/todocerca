
-- 1. Empresas de transporte (maquiladoras/shelter)
CREATE TABLE public.empresas_transporte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  rfc TEXT,
  contacto_nombre TEXT,
  contacto_email TEXT,
  contacto_telefono TEXT,
  logo_url TEXT,
  user_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa admin gestiona su empresa"
  ON public.empresas_transporte FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins gestionan todas las empresas"
  ON public.empresas_transporte FOR ALL
  USING (is_admin());

-- 2. Contratos entre maquiladora y concesionario
CREATE TABLE public.contratos_transporte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas_transporte(id) ON DELETE CASCADE,
  concesionario_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  tarifa_por_persona NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  descripcion TEXT,
  frecuencia_corte TEXT NOT NULL DEFAULT 'quincenal',
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa admin gestiona sus contratos"
  ON public.contratos_transporte FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.empresas_transporte e
    WHERE e.id = contratos_transporte.empresa_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Concesionario ve sus contratos"
  ON public.contratos_transporte FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = contratos_transporte.concesionario_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Admins gestionan todos los contratos"
  ON public.contratos_transporte FOR ALL
  USING (is_admin());

-- Now add deferred policy on empresas_transporte referencing contratos
CREATE POLICY "Concesionarios ven empresas con contrato"
  ON public.empresas_transporte FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos_transporte ct
    JOIN public.proveedores p ON p.id = ct.concesionario_id
    WHERE ct.empresa_id = empresas_transporte.id
    AND p.user_id = auth.uid()
  ));

-- 3. Empleados de la empresa
CREATE TABLE public.empleados_empresa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas_transporte(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  numero_nomina TEXT,
  departamento TEXT,
  turno TEXT DEFAULT 'matutino',
  qr_tipo TEXT NOT NULL DEFAULT 'fijo' CHECK (qr_tipo IN ('fijo', 'rotativo')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empleados_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa admin gestiona sus empleados"
  ON public.empleados_empresa FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.empresas_transporte e
    WHERE e.id = empleados_empresa.empresa_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Empleado ve su propio registro"
  ON public.empleados_empresa FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Concesionarios ven empleados de contratos activos"
  ON public.empleados_empresa FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos_transporte ct
    JOIN public.proveedores p ON p.id = ct.concesionario_id
    WHERE ct.empresa_id = empleados_empresa.empresa_id
    AND p.user_id = auth.uid()
    AND ct.is_active = true
  ));

CREATE POLICY "Admins gestionan todos los empleados"
  ON public.empleados_empresa FOR ALL
  USING (is_admin());

-- 4. QR de empleados
CREATE TABLE public.qr_empleados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id UUID NOT NULL REFERENCES public.empleados_empresa(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas_transporte(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  qr_tipo TEXT NOT NULL DEFAULT 'fijo' CHECK (qr_tipo IN ('fijo', 'rotativo')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  fecha_vigencia_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vigencia_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa admin gestiona QR de sus empleados"
  ON public.qr_empleados FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.empresas_transporte e
    WHERE e.id = qr_empleados.empresa_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Empleado ve sus propios QR"
  ON public.qr_empleados FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.empleados_empresa em
    WHERE em.id = qr_empleados.empleado_id AND em.user_id = auth.uid()
  ));

CREATE POLICY "Admins gestionan todos los QR"
  ON public.qr_empleados FOR ALL
  USING (is_admin());

-- 5. Validaciones de transporte de personal
CREATE TABLE public.validaciones_transporte_personal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_empleado_id UUID NOT NULL REFERENCES public.qr_empleados(id),
  empleado_id UUID NOT NULL REFERENCES public.empleados_empresa(id),
  empresa_id UUID NOT NULL REFERENCES public.empresas_transporte(id),
  contrato_id UUID REFERENCES public.contratos_transporte(id),
  chofer_id UUID NOT NULL,
  unidad_id UUID REFERENCES public.unidades_empresa(id),
  ruta_id UUID REFERENCES public.productos(id),
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_local DATE NOT NULL DEFAULT CURRENT_DATE,
  turno TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.validaciones_transporte_personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa ve validaciones de sus empleados"
  ON public.validaciones_transporte_personal FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.empresas_transporte e
    WHERE e.id = validaciones_transporte_personal.empresa_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Concesionario ve validaciones de sus contratos"
  ON public.validaciones_transporte_personal FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.contratos_transporte ct
    JOIN public.proveedores p ON p.id = ct.concesionario_id
    WHERE ct.id = validaciones_transporte_personal.contrato_id
    AND p.user_id = auth.uid()
  ));

CREATE POLICY "Chofer ve sus propias validaciones"
  ON public.validaciones_transporte_personal FOR SELECT
  USING (chofer_id = auth.uid());

CREATE POLICY "Sistema inserta validaciones"
  ON public.validaciones_transporte_personal FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins ven todas las validaciones"
  ON public.validaciones_transporte_personal FOR ALL
  USING (is_admin());

-- 6. Cortes de conciliación
CREATE TABLE public.cortes_transporte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_transporte(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  total_validaciones INTEGER NOT NULL DEFAULT 0,
  total_empleados_unicos INTEGER NOT NULL DEFAULT 0,
  tarifa_aplicada NUMERIC(10,2) NOT NULL,
  monto_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado_empresa', 'aprobado_concesionario', 'conciliado', 'pagado', 'disputado')),
  notas_empresa TEXT,
  notas_concesionario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cortes_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa ve cortes de sus contratos"
  ON public.cortes_transporte FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.contratos_transporte ct
    JOIN public.empresas_transporte e ON e.id = ct.empresa_id
    WHERE ct.id = cortes_transporte.contrato_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Concesionario ve cortes de sus contratos"
  ON public.cortes_transporte FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.contratos_transporte ct
    JOIN public.proveedores p ON p.id = ct.concesionario_id
    WHERE ct.id = cortes_transporte.contrato_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Admins gestionan todos los cortes"
  ON public.cortes_transporte FOR ALL
  USING (is_admin());

-- Triggers updated_at
CREATE TRIGGER update_empresas_transporte_updated_at
  BEFORE UPDATE ON public.empresas_transporte
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contratos_transporte_updated_at
  BEFORE UPDATE ON public.contratos_transporte
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_empleados_empresa_updated_at
  BEFORE UPDATE ON public.empleados_empresa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cortes_transporte_updated_at
  BEFORE UPDATE ON public.cortes_transporte
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_empleados_empresa_id ON public.empleados_empresa(empresa_id);
CREATE INDEX idx_qr_empleados_token ON public.qr_empleados(token);
CREATE INDEX idx_qr_empleados_empleado ON public.qr_empleados(empleado_id);
CREATE INDEX idx_validaciones_tp_empresa ON public.validaciones_transporte_personal(empresa_id, fecha_local);
CREATE INDEX idx_validaciones_tp_contrato ON public.validaciones_transporte_personal(contrato_id, fecha_local);
CREATE INDEX idx_validaciones_tp_empleado ON public.validaciones_transporte_personal(empleado_id, fecha_local);
CREATE INDEX idx_cortes_contrato ON public.cortes_transporte(contrato_id, fecha_inicio);

-- Función helper
CREATE OR REPLACE FUNCTION public.is_empresa_transporte_admin(p_empresa_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM empresas_transporte
    WHERE id = p_empresa_id AND user_id = p_user_id
  )
$$;
