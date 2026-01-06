-- Delete duplicate appointments keeping the oldest one
DELETE FROM citas 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY proveedor_id, fecha, hora_inicio 
      ORDER BY created_at ASC
    ) as rn
    FROM citas
  ) ranked WHERE rn > 1
);

-- Delete from citas_publicas any orphaned records
DELETE FROM citas_publicas 
WHERE id NOT IN (SELECT id FROM citas);

-- Add unique constraint to prevent duplicate appointments
ALTER TABLE public.citas 
ADD CONSTRAINT unique_appointment_slot 
UNIQUE (proveedor_id, fecha, hora_inicio);

-- Also add to citas_publicas for consistency
ALTER TABLE public.citas_publicas 
ADD CONSTRAINT unique_public_appointment_slot 
UNIQUE (proveedor_id, fecha, hora_inicio);