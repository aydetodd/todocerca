
-- LUGARES
CREATE TABLE public.ev_lugares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  nombre text NOT NULL,
  direccion text,
  ciudad text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_lugares TO authenticated;
GRANT ALL ON public.ev_lugares TO service_role;
ALTER TABLE public.ev_lugares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lugares_owner_all" ON public.ev_lugares FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- SLOTS ANUALES
CREATE TABLE public.ev_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lugar_id uuid NOT NULL REFERENCES public.ev_lugares(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  precio_mxn numeric NOT NULL DEFAULT 500,
  estado text NOT NULL DEFAULT 'pending',
  pagado_en timestamptz,
  inicia_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_slots TO authenticated;
GRANT ALL ON public.ev_slots TO service_role;
ALTER TABLE public.ev_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots_owner_all" ON public.ev_slots FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- EVENTOS
CREATE TABLE public.ev_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  lugar_id uuid REFERENCES public.ev_lugares(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'privado',
  descripcion text,
  fondo_url text,
  inicia_en timestamptz,
  termina_en timestamptz,
  sorteo_salida boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_eventos TO authenticated;
GRANT ALL ON public.ev_eventos TO service_role;
ALTER TABLE public.ev_eventos ENABLE ROW LEVEL SECURITY;

-- VALIDADORES (creada antes de las políticas que la usan)
CREATE TABLE public.ev_validadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ev_eventos(id) ON DELETE CASCADE,
  user_id uuid,
  nombre text,
  telefono text,
  invite_token text UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_validadores TO authenticated;
GRANT ALL ON public.ev_validadores TO service_role;
ALTER TABLE public.ev_validadores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ev_is_owner(_evento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ev_eventos e WHERE e.id = _evento_id AND e.owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.ev_is_validador(_evento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ev_validadores v WHERE v.evento_id = _evento_id AND v.user_id = auth.uid() AND v.activo);
$$;

CREATE POLICY "eventos_owner_all" ON public.ev_eventos FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "eventos_validador_read" ON public.ev_eventos FOR SELECT TO authenticated
  USING (public.ev_is_validador(id));

CREATE POLICY "validadores_owner_all" ON public.ev_validadores FOR ALL TO authenticated
  USING (public.ev_is_owner(evento_id)) WITH CHECK (public.ev_is_owner(evento_id));
CREATE POLICY "validadores_self_read" ON public.ev_validadores FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- GRUPOS
CREATE TABLE public.ev_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ev_eventos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  telefono text,
  pases_total integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_grupos TO authenticated;
GRANT ALL ON public.ev_grupos TO service_role;
ALTER TABLE public.ev_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupos_owner_all" ON public.ev_grupos FOR ALL TO authenticated
  USING (public.ev_is_owner(evento_id)) WITH CHECK (public.ev_is_owner(evento_id));
CREATE POLICY "grupos_validador_read" ON public.ev_grupos FOR SELECT TO authenticated
  USING (public.ev_is_validador(evento_id));

-- PASES
CREATE TABLE public.ev_pases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ev_eventos(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.ev_grupos(id) ON DELETE SET NULL,
  codigo text NOT NULL UNIQUE DEFAULT upper(encode(gen_random_bytes(6),'hex')),
  nombre_invitado text,
  telefono text,
  personas integer NOT NULL DEFAULT 1,
  precio_mxn numeric NOT NULL DEFAULT 1,
  estado text NOT NULL DEFAULT 'valid',
  entrada_en timestamptz,
  salida_en timestamptz,
  premio text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_pases TO authenticated;
GRANT ALL ON public.ev_pases TO service_role;
ALTER TABLE public.ev_pases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pases_owner_all" ON public.ev_pases FOR ALL TO authenticated
  USING (public.ev_is_owner(evento_id)) WITH CHECK (public.ev_is_owner(evento_id));
CREATE POLICY "pases_validador_read" ON public.ev_pases FOR SELECT TO authenticated
  USING (public.ev_is_validador(evento_id));
CREATE POLICY "pases_validador_update" ON public.ev_pases FOR UPDATE TO authenticated
  USING (public.ev_is_validador(evento_id)) WITH CHECK (public.ev_is_validador(evento_id));

-- ESCANEOS
CREATE TABLE public.ev_escaneos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ev_eventos(id) ON DELETE CASCADE,
  pase_id uuid REFERENCES public.ev_pases(id) ON DELETE SET NULL,
  validador_id uuid REFERENCES public.ev_validadores(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'entrada',
  resultado text NOT NULL DEFAULT 'ok',
  offline boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  escaneado_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ev_escaneos TO authenticated;
GRANT ALL ON public.ev_escaneos TO service_role;
ALTER TABLE public.ev_escaneos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escaneos_owner_read" ON public.ev_escaneos FOR SELECT TO authenticated
  USING (public.ev_is_owner(evento_id));
CREATE POLICY "escaneos_validador_all" ON public.ev_escaneos FOR ALL TO authenticated
  USING (public.ev_is_validador(evento_id)) WITH CHECK (public.ev_is_validador(evento_id));

-- Consulta pública del pase por código (invitado sin cuenta)
CREATE OR REPLACE FUNCTION public.ev_get_pase_publico(_codigo text)
RETURNS TABLE (
  codigo text, nombre_invitado text, personas integer, estado text,
  evento_nombre text, evento_inicia timestamptz, evento_fondo text,
  lugar_nombre text, lugar_direccion text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.codigo, p.nombre_invitado, p.personas, p.estado,
         e.nombre, e.inicia_en, e.fondo_url,
         l.nombre, l.direccion
  FROM public.ev_pases p
  JOIN public.ev_eventos e ON e.id = p.evento_id
  LEFT JOIN public.ev_lugares l ON l.id = e.lugar_id
  WHERE p.codigo = upper(_codigo)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.ev_get_pase_publico(text) TO anon, authenticated;

CREATE INDEX ev_pases_evento_idx ON public.ev_pases(evento_id);
CREATE INDEX ev_escaneos_evento_idx ON public.ev_escaneos(evento_id);
