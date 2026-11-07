REVOKE UPDATE ON public.terminal_invites FROM authenticated;
GRANT UPDATE(terminal_name,updated_at) ON public.terminal_invites TO authenticated;