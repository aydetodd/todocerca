-- Corregir políticas de votaciones y votacion_opciones

-- 1. Eliminar políticas con bugs
DROP POLICY IF EXISTS "Members can view closed votaciones" ON public.votaciones;
DROP POLICY IF EXISTS "Votaciones cerradas visibles para miembros y creador" ON public.votaciones;
DROP POLICY IF EXISTS "Creadores pueden gestionar opciones" ON public.votacion_opciones;

-- 2. Crear política corregida para votaciones cerradas
CREATE POLICY "Members can view closed votaciones"
ON public.votaciones FOR SELECT
USING (
  tipo = 'cerrada' AND (
    creador_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM votacion_miembros vm
      WHERE vm.votacion_id = votaciones.id AND vm.user_id = auth.uid()
    )
  )
);

-- 3. Crear políticas separadas para votacion_opciones (INSERT necesita WITH CHECK)
CREATE POLICY "Creators can insert options"
ON public.votacion_opciones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM votaciones
    WHERE votaciones.id = votacion_opciones.votacion_id 
    AND votaciones.creador_id = auth.uid()
  )
);

CREATE POLICY "Creators can update options"
ON public.votacion_opciones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM votaciones
    WHERE votaciones.id = votacion_opciones.votacion_id 
    AND votaciones.creador_id = auth.uid()
  )
);

CREATE POLICY "Creators can delete options"
ON public.votacion_opciones FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM votaciones
    WHERE votaciones.id = votacion_opciones.votacion_id 
    AND votaciones.creador_id = auth.uid()
  )
);