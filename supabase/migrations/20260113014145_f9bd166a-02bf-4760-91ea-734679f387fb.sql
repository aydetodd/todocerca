-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Members can view closed votaciones" ON public.votaciones;
DROP POLICY IF EXISTS "Creadores pueden gestionar miembros" ON public.votacion_miembros;
DROP POLICY IF EXISTS "Opciones visibles si votación visible" ON public.votacion_opciones;
DROP POLICY IF EXISTS "Creadores pueden ver votos de sus votaciones" ON public.votos;
DROP POLICY IF EXISTS "Creadores pueden ver solicitudes de sus votaciones" ON public.votacion_solicitudes;
DROP POLICY IF EXISTS "Creadores pueden actualizar solicitudes" ON public.votacion_solicitudes;

-- Create security definer functions to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_votacion_member(_user_id uuid, _votacion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM votacion_miembros
    WHERE user_id = _user_id
      AND votacion_id = _votacion_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_votacion_creator(_user_id uuid, _votacion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM votaciones
    WHERE id = _votacion_id
      AND creador_id = _user_id
  )
$$;

-- Recreate policies using the security definer functions
CREATE POLICY "Members can view closed votaciones" ON public.votaciones
FOR SELECT USING (
  tipo = 'cerrada'::text AND (
    creador_id = auth.uid() OR 
    public.is_votacion_member(auth.uid(), id)
  )
);

CREATE POLICY "Creadores pueden gestionar miembros" ON public.votacion_miembros
FOR ALL USING (
  public.is_votacion_creator(auth.uid(), votacion_id)
);

CREATE POLICY "Opciones visibles si votación visible" ON public.votacion_opciones
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM votaciones v
    WHERE v.id = votacion_opciones.votacion_id
    AND (
      v.tipo = 'abierta'::text
      OR v.creador_id = auth.uid()
      OR public.is_votacion_member(auth.uid(), v.id)
    )
  )
);

CREATE POLICY "Creadores pueden ver votos de sus votaciones" ON public.votos
FOR SELECT USING (
  public.is_votacion_creator(auth.uid(), votacion_id)
);

CREATE POLICY "Creadores pueden ver solicitudes de sus votaciones" ON public.votacion_solicitudes
FOR SELECT USING (
  public.is_votacion_creator(auth.uid(), votacion_id)
);

CREATE POLICY "Creadores pueden actualizar solicitudes" ON public.votacion_solicitudes
FOR UPDATE USING (
  public.is_votacion_creator(auth.uid(), votacion_id)
);