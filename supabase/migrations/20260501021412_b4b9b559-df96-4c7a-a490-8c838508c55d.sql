DROP POLICY IF EXISTS "Concesionarios actualizan su verificación en draft" ON public.verificaciones_concesionario;

CREATE POLICY "Concesionarios actualizan solicitud no aprobada"
ON public.verificaciones_concesionario
FOR UPDATE
USING (
  public.is_admin()
  OR (
    estado IN ('draft', 'pending', 'in_review', 'rejected')
    AND EXISTS (
      SELECT 1
      FROM public.proveedores p
      WHERE p.id = verificaciones_concesionario.concesionario_id
        AND p.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    estado IN ('draft', 'pending', 'in_review', 'rejected')
    AND EXISTS (
      SELECT 1
      FROM public.proveedores p
      WHERE p.id = verificaciones_concesionario.concesionario_id
        AND p.user_id = auth.uid()
    )
  )
);

WITH files AS (
  SELECT
    split_part(o.name, '/', 1)::uuid AS concesionario_id,
    CASE
      WHEN split_part(split_part(o.name, '/', 2), '.', 1) LIKE 'tarjeta_circulacion_%' THEN 'tarjeta_circulacion'
      WHEN split_part(split_part(o.name, '/', 2), '.', 1) LIKE 'fotos_unidades_%' THEN 'fotos_unidades'
      ELSE split_part(split_part(o.name, '/', 2), '.', 1)
    END AS doc_key,
    o.name AS path,
    o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'verificacion-docs'
    AND o.name ~ '^[0-9a-fA-F-]{36}/[^/]+$'
), grouped AS (
  SELECT
    concesionario_id,
    jsonb_object_agg(doc_key, paths ORDER BY doc_key) AS documentos
  FROM (
    SELECT
      concesionario_id,
      doc_key,
      to_jsonb(array_agg(path ORDER BY created_at)) AS paths
    FROM files
    GROUP BY concesionario_id, doc_key
  ) by_type
  GROUP BY concesionario_id
)
UPDATE public.verificaciones_concesionario vc
SET
  documentos = COALESCE(vc.documentos, '{}'::jsonb) || grouped.documentos,
  metodo_envio = 'app',
  estado = CASE WHEN vc.estado IN ('draft', 'pending') THEN 'in_review' ELSE vc.estado END,
  updated_at = now()
FROM grouped
WHERE vc.concesionario_id = grouped.concesionario_id
  AND vc.estado IN ('draft', 'pending', 'in_review', 'rejected');