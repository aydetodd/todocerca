ALTER FUNCTION public.terminal_phone_matches(text,text) SET search_path = public;
REVOKE ALL ON FUNCTION public.terminal_merchant_valid(uuid) FROM authenticated, PUBLIC, anon;
DROP POLICY terminal_invites_read ON public.terminal_invites;
CREATE POLICY terminal_invites_read ON public.terminal_invites FOR SELECT TO authenticated USING (merchant_user_id=auth.uid() OR invited_user_id=auth.uid());