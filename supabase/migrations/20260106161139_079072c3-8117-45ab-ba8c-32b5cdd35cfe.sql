-- Enable full row data for realtime update payloads
ALTER TABLE public.citas REPLICA IDENTITY FULL;

-- Ensure citas is in the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'citas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas;
  END IF;
END $$;

-- Cleanup duplicates (keep earliest, cancel the rest) so we can enforce uniqueness
WITH ranked AS (
  SELECT
    id,
    proveedor_id,
    fecha,
    hora_inicio,
    ROW_NUMBER() OVER (
      PARTITION BY proveedor_id, fecha, hora_inicio
      ORDER BY created_at ASC
    ) AS rn
  FROM public.citas
  WHERE estado <> 'cancelada'
)
UPDATE public.citas c
SET estado = 'cancelada',
    updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- Prevent double-booking for the same provider+day+start_time while active
CREATE UNIQUE INDEX IF NOT EXISTS citas_unique_slot_active
ON public.citas (proveedor_id, fecha, hora_inicio)
WHERE estado <> 'cancelada';
