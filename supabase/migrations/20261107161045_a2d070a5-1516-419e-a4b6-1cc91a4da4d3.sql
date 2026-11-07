REVOKE ALL ON FUNCTION public.qard_capture_collection_identity() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.qard_collection_report(date,date) SECURITY INVOKER;
ALTER FUNCTION public.qard_collection_details(date,date,text,text,integer) SECURITY INVOKER;
ALTER FUNCTION public.terminal_set_name(uuid,text) SECURITY INVOKER;
GRANT UPDATE(terminal_name,updated_at) ON public.terminal_invites TO authenticated;
CREATE POLICY terminal_invites_owner_name_update ON public.terminal_invites FOR UPDATE TO authenticated USING (merchant_user_id=auth.uid()) WITH CHECK (merchant_user_id=auth.uid());