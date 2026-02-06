
-- =============================================
-- Tabla: choferes de empresas de transporte privado
-- Cada chofer se vincula a un proveedor (empresa)
-- =============================================
CREATE TABLE public.choferes_empresa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  user_id UUID, -- se vincula después de aceptar invitación (NO FK a auth.users)
  telefono TEXT NOT NULL,
  nombre TEXT,
  invite_token UUID NOT NULL DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_choferes_empresa_proveedor ON public.choferes_empresa(proveedor_id);
CREATE INDEX idx_choferes_empresa_user ON public.choferes_empresa(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_choferes_empresa_token ON public.choferes_empresa(invite_token);
CREATE UNIQUE INDEX idx_choferes_empresa_telefono_proveedor ON public.choferes_empresa(proveedor_id, normalize_phone(telefono));

-- RLS
ALTER TABLE public.choferes_empresa ENABLE ROW LEVEL SECURITY;

-- El dueño de la empresa puede ver y gestionar sus choferes
CREATE POLICY "choferes_owner_all" ON public.choferes_empresa
FOR ALL USING (
  public.is_proveedor_owner(proveedor_id, auth.uid())
);

-- El chofer puede ver su propio registro
CREATE POLICY "choferes_self_read" ON public.choferes_empresa
FOR SELECT USING (user_id = auth.uid());

-- =============================================
-- Tabla: asignaciones diarias chofer-vehículo
-- =============================================
CREATE TABLE public.asignaciones_chofer (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  chofer_id UUID NOT NULL REFERENCES choferes_empresa(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  asignado_por UUID, -- user_id de quien asignó
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(producto_id, fecha), -- un chofer por vehículo por día
  UNIQUE(chofer_id, fecha)    -- un vehículo por chofer por día
);

-- Índices
CREATE INDEX idx_asignaciones_fecha ON public.asignaciones_chofer(fecha);
CREATE INDEX idx_asignaciones_chofer ON public.asignaciones_chofer(chofer_id);
CREATE INDEX idx_asignaciones_producto ON public.asignaciones_chofer(producto_id);

-- RLS
ALTER TABLE public.asignaciones_chofer ENABLE ROW LEVEL SECURITY;

-- Función helper: verificar si el usuario es dueño del producto vía proveedor
CREATE OR REPLACE FUNCTION public.is_chofer_empresa_owner(p_chofer_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM choferes_empresa ce
    JOIN proveedores prov ON prov.id = ce.proveedor_id
    WHERE ce.id = p_chofer_id
    AND prov.user_id = p_user_id
  );
$$;

-- Función helper: verificar si el usuario ES el chofer
CREATE OR REPLACE FUNCTION public.is_chofer_self(p_chofer_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM choferes_empresa ce
    WHERE ce.id = p_chofer_id
    AND ce.user_id = p_user_id
  );
$$;

-- El dueño de la empresa puede gestionar asignaciones
CREATE POLICY "asignaciones_owner_all" ON public.asignaciones_chofer
FOR ALL USING (
  public.is_chofer_empresa_owner(chofer_id, auth.uid())
);

-- El chofer puede ver y modificar sus propias asignaciones
CREATE POLICY "asignaciones_chofer_read" ON public.asignaciones_chofer
FOR SELECT USING (
  public.is_chofer_self(chofer_id, auth.uid())
);

-- El chofer puede crear/actualizar sus propias asignaciones (cuando el admin permite)
CREATE POLICY "asignaciones_chofer_write" ON public.asignaciones_chofer
FOR INSERT WITH CHECK (
  public.is_chofer_self(chofer_id, auth.uid())
);

CREATE POLICY "asignaciones_chofer_update" ON public.asignaciones_chofer
FOR UPDATE USING (
  public.is_chofer_self(chofer_id, auth.uid())
);

-- Trigger para updated_at en choferes_empresa
CREATE TRIGGER update_choferes_empresa_updated_at
BEFORE UPDATE ON public.choferes_empresa
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
