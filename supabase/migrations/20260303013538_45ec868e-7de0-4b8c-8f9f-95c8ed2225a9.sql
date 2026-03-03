CREATE OR REPLACE FUNCTION public.find_qr_ticket_by_short_code(p_short_code text)
RETURNS SETOF qr_tickets
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM qr_tickets
  WHERE LOWER(RIGHT(token::text, 6)) = LOWER(p_short_code)
  ORDER BY created_at DESC
  LIMIT 1;
$$;