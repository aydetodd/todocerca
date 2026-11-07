CREATE SCHEMA IF NOT EXISTS terminal_private;
REVOKE ALL ON SCHEMA terminal_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA terminal_private TO authenticated,service_role;
ALTER FUNCTION public.terminal_register_scoped(text,text,uuid) SET SCHEMA terminal_private;
CREATE OR REPLACE FUNCTION public.terminal_invite_phone(_phone text,_code text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT terminal_private.terminal_register_scoped(_phone,_code,NULL); $$;
CREATE OR REPLACE FUNCTION public.terminal_invite_sucursal(_phone text,_negocio uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT terminal_private.terminal_register_scoped(_phone,'collection',_negocio); $$;