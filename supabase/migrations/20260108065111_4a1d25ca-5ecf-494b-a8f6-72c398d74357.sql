-- Tabla principal de votaciones
CREATE TABLE public.votaciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'abierta' CHECK (tipo IN ('abierta', 'cerrada')),
  nivel TEXT NOT NULL DEFAULT 'nacional' CHECK (nivel IN ('nacional', 'estatal', 'ciudad', 'barrio', 'escuela')),
  -- Ubicación geográfica (opcional según nivel)
  pais_id UUID REFERENCES public.paises(id),
  estado_id UUID REFERENCES public.subdivisiones_nivel1(id),
  ciudad_id UUID REFERENCES public.subdivisiones_nivel2(id),
  barrio TEXT,
  escuela TEXT,
  -- Configuración
  fecha_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_fin TIMESTAMP WITH TIME ZONE NOT NULL,
  max_votos_por_usuario INTEGER DEFAULT 1,
  requiere_verificacion_telefono BOOLEAN DEFAULT true,
  -- Creador
  creador_id UUID NOT NULL REFERENCES auth.users(id),
  -- Estados
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Opciones de votación (candidatos, opciones, etc.)
CREATE TABLE public.votacion_opciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  votacion_id UUID NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  imagen_url TEXT,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Votos registrados
CREATE TABLE public.votos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  votacion_id UUID NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  opcion_id UUID NOT NULL REFERENCES public.votacion_opciones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  telefono TEXT,
  fecha_voto TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  observacion TEXT,
  ip_address TEXT,
  user_agent TEXT,
  -- Evitar votos duplicados
  UNIQUE(votacion_id, user_id)
);

-- Solicitudes de acceso para votaciones cerradas
CREATE TABLE public.votacion_solicitudes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  votacion_id UUID NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  mensaje TEXT,
  respondido_por UUID REFERENCES auth.users(id),
  respondido_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(votacion_id, user_id)
);

-- Miembros aprobados para votaciones cerradas
CREATE TABLE public.votacion_miembros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  votacion_id UUID NOT NULL REFERENCES public.votaciones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  agregado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(votacion_id, user_id)
);

-- Índices para optimización
CREATE INDEX idx_votaciones_tipo ON public.votaciones(tipo);
CREATE INDEX idx_votaciones_nivel ON public.votaciones(nivel);
CREATE INDEX idx_votaciones_creador ON public.votaciones(creador_id);
CREATE INDEX idx_votaciones_activas ON public.votaciones(is_active, fecha_fin);
CREATE INDEX idx_votos_votacion ON public.votos(votacion_id);
CREATE INDEX idx_votos_opcion ON public.votos(opcion_id);
CREATE INDEX idx_votos_user ON public.votos(user_id);

-- Habilitar RLS
ALTER TABLE public.votaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacion_miembros ENABLE ROW LEVEL SECURITY;

-- Políticas para votaciones
CREATE POLICY "Votaciones abiertas visibles para todos"
ON public.votaciones FOR SELECT
USING (tipo = 'abierta' AND is_active = true);

CREATE POLICY "Votaciones cerradas visibles para miembros y creador"
ON public.votaciones FOR SELECT
USING (
  tipo = 'cerrada' AND (
    creador_id = auth.uid() OR
    EXISTS (SELECT 1 FROM votacion_miembros WHERE votacion_id = id AND user_id = auth.uid())
  )
);

CREATE POLICY "Usuarios pueden crear votaciones"
ON public.votaciones FOR INSERT
WITH CHECK (auth.uid() = creador_id);

CREATE POLICY "Creadores pueden actualizar sus votaciones"
ON public.votaciones FOR UPDATE
USING (auth.uid() = creador_id);

CREATE POLICY "Creadores pueden eliminar sus votaciones"
ON public.votaciones FOR DELETE
USING (auth.uid() = creador_id);

-- Políticas para opciones
CREATE POLICY "Opciones visibles si votación visible"
ON public.votacion_opciones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM votaciones v 
    WHERE v.id = votacion_id AND (
      v.tipo = 'abierta' OR 
      v.creador_id = auth.uid() OR
      EXISTS (SELECT 1 FROM votacion_miembros WHERE votacion_id = v.id AND user_id = auth.uid())
    )
  )
);

CREATE POLICY "Creadores pueden gestionar opciones"
ON public.votacion_opciones FOR ALL
USING (
  EXISTS (SELECT 1 FROM votaciones WHERE id = votacion_id AND creador_id = auth.uid())
);

-- Políticas para votos
CREATE POLICY "Usuarios pueden ver sus propios votos"
ON public.votos FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Creadores pueden ver votos de sus votaciones"
ON public.votos FOR SELECT
USING (
  EXISTS (SELECT 1 FROM votaciones WHERE id = votacion_id AND creador_id = auth.uid())
);

CREATE POLICY "Usuarios pueden votar en votaciones abiertas"
ON public.votos FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM votaciones v 
    WHERE v.id = votacion_id AND v.is_active = true AND v.fecha_fin > now() AND (
      v.tipo = 'abierta' OR
      EXISTS (SELECT 1 FROM votacion_miembros WHERE votacion_id = v.id AND user_id = auth.uid())
    )
  )
);

-- Políticas para solicitudes
CREATE POLICY "Usuarios pueden ver sus solicitudes"
ON public.votacion_solicitudes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Creadores pueden ver solicitudes de sus votaciones"
ON public.votacion_solicitudes FOR SELECT
USING (
  EXISTS (SELECT 1 FROM votaciones WHERE id = votacion_id AND creador_id = auth.uid())
);

CREATE POLICY "Usuarios pueden crear solicitudes"
ON public.votacion_solicitudes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creadores pueden actualizar solicitudes"
ON public.votacion_solicitudes FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM votaciones WHERE id = votacion_id AND creador_id = auth.uid())
);

-- Políticas para miembros
CREATE POLICY "Miembros pueden ver su membresía"
ON public.votacion_miembros FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Creadores pueden gestionar miembros"
ON public.votacion_miembros FOR ALL
USING (
  EXISTS (SELECT 1 FROM votaciones WHERE id = votacion_id AND creador_id = auth.uid())
);

-- Trigger para updated_at
CREATE TRIGGER update_votaciones_updated_at
BEFORE UPDATE ON public.votaciones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();