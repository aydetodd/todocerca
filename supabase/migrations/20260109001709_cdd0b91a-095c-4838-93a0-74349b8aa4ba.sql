-- Drop existing problematic policies
DROP POLICY IF EXISTS "Votaciones abiertas visibles para todos" ON public.votaciones;
DROP POLICY IF EXISTS "Votaciones cerradas visibles para miembros" ON public.votaciones;
DROP POLICY IF EXISTS "Usuarios pueden crear votaciones" ON public.votaciones;
DROP POLICY IF EXISTS "Creadores pueden actualizar sus votaciones" ON public.votaciones;
DROP POLICY IF EXISTS "Creadores pueden eliminar sus votaciones" ON public.votaciones;

-- Create simplified non-recursive policies
CREATE POLICY "Anyone can view open votaciones"
ON public.votaciones FOR SELECT
USING (tipo = 'abierta');

CREATE POLICY "Members can view closed votaciones"
ON public.votaciones FOR SELECT
USING (
  tipo = 'cerrada' AND (
    creador_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.votacion_miembros vm
      WHERE vm.votacion_id = id AND vm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can create votaciones"
ON public.votaciones FOR INSERT
WITH CHECK (auth.uid() = creador_id);

CREATE POLICY "Creators can update their votaciones"
ON public.votaciones FOR UPDATE
USING (auth.uid() = creador_id);

CREATE POLICY "Creators can delete their votaciones"
ON public.votaciones FOR DELETE
USING (auth.uid() = creador_id);