-- Reemplazar política para permitir lectura de todos los estados (activos + resueltos)
DROP POLICY IF EXISTS "Authenticated can read active reports via base" ON public.citizen_reports;

CREATE POLICY "Authenticated can read all reports via base"
ON public.citizen_reports
FOR SELECT
TO authenticated
USING (true);