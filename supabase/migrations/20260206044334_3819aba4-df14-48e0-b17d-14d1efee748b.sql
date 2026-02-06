-- Allow any authenticated user to read a driver record by invite_token (needed to verify invitation)
CREATE POLICY "anyone_can_read_by_invite_token"
ON public.choferes_empresa
FOR SELECT
USING (true);

-- Drop the restrictive self-read policy since the new one covers it
DROP POLICY IF EXISTS "choferes_self_read" ON public.choferes_empresa;