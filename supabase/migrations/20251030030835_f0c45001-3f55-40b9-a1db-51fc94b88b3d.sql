-- Eliminar la foreign key constraint problemática de tracking_groups
ALTER TABLE public.tracking_groups 
DROP CONSTRAINT IF EXISTS tracking_groups_owner_id_fkey;

-- La columna owner_id ya no necesita foreign key porque Supabase Auth maneja los usuarios
-- Esto permite crear grupos sin problemas de referencia