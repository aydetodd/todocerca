DELETE FROM public.verificaciones_concesionario
WHERE estado = 'pending'
  AND (documentos IS NULL OR documentos = '{}'::jsonb)
  AND COALESCE(total_unidades, 0) = 0
  AND fecha_revision IS NULL;