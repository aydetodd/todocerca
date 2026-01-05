-- Tabla para horarios de trabajo del proveedor
CREATE TABLE public.horarios_proveedor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6), -- 0=Domingo, 1=Lunes, etc.
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  es_descanso BOOLEAN NOT NULL DEFAULT false, -- true = es un break/descanso
  duracion_cita_minutos INTEGER NOT NULL DEFAULT 60, -- duración de cada cita
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT horario_valido CHECK (hora_inicio < hora_fin)
);

-- Tabla para citas agendadas
CREATE TABLE public.citas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  cliente_user_id UUID, -- puede ser null si es cliente no registrado
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  servicio TEXT, -- descripción del servicio solicitado
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_horarios_proveedor_id ON public.horarios_proveedor(proveedor_id);
CREATE INDEX idx_horarios_dia ON public.horarios_proveedor(dia_semana);
CREATE INDEX idx_citas_proveedor_id ON public.citas(proveedor_id);
CREATE INDEX idx_citas_fecha ON public.citas(fecha);
CREATE INDEX idx_citas_cliente ON public.citas(cliente_user_id);

-- Trigger para updated_at
CREATE TRIGGER update_horarios_proveedor_updated_at
  BEFORE UPDATE ON public.horarios_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_citas_updated_at
  BEFORE UPDATE ON public.citas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.horarios_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para horarios_proveedor
-- Cualquiera puede ver los horarios (para agendar citas)
CREATE POLICY "Horarios son públicos para lectura"
  ON public.horarios_proveedor
  FOR SELECT
  USING (true);

-- Solo el proveedor puede modificar sus horarios
CREATE POLICY "Proveedores pueden gestionar sus horarios"
  ON public.horarios_proveedor
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proveedores p
      WHERE p.id = proveedor_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proveedores p
      WHERE p.id = proveedor_id AND p.user_id = auth.uid()
    )
  );

-- Políticas RLS para citas
-- Proveedores pueden ver sus citas
CREATE POLICY "Proveedores pueden ver sus citas"
  ON public.citas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proveedores p
      WHERE p.id = proveedor_id AND p.user_id = auth.uid()
    )
  );

-- Clientes pueden ver sus propias citas
CREATE POLICY "Clientes pueden ver sus citas"
  ON public.citas
  FOR SELECT
  USING (cliente_user_id = auth.uid());

-- Cualquiera autenticado puede crear citas
CREATE POLICY "Usuarios pueden crear citas"
  ON public.citas
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Proveedores pueden actualizar citas de su negocio
CREATE POLICY "Proveedores pueden actualizar sus citas"
  ON public.citas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.proveedores p
      WHERE p.id = proveedor_id AND p.user_id = auth.uid()
    )
  );

-- Clientes pueden cancelar sus propias citas
CREATE POLICY "Clientes pueden cancelar sus citas"
  ON public.citas
  FOR UPDATE
  USING (cliente_user_id = auth.uid())
  WITH CHECK (estado = 'cancelada');