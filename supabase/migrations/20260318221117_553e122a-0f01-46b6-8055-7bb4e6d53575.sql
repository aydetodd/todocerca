
-- Fix SOS function with correct UUID type
CREATE OR REPLACE FUNCTION public.get_sos_by_token(p_token uuid)
RETURNS SETOF sos_alerts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM sos_alerts
  WHERE share_token = p_token
  AND status = 'active'
  AND expires_at > now();
$$;
