-- Allow anyone authenticated to read driver assignments tied to PUBLIC routes
-- so passengers viewing a public transport route can see which units are
-- assigned to that route (camión visible on the map).
CREATE POLICY "asignaciones_chofer_public_route_read"
ON public.asignaciones_chofer
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.productos p
    WHERE p.id = asignaciones_chofer.producto_id
      AND COALESCE(p.is_private, false) = false
      AND COALESCE(p.route_type, 'urbana') IN ('urbana', 'foranea')
  )
);