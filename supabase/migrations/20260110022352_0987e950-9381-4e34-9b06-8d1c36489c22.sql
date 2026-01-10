
-- Eliminar el perfil de Liliana
DELETE FROM profiles WHERE user_id = '408ea993-8262-4d77-88bb-d1b992f9ed20';

-- Nota: El usuario de auth.users debe eliminarse manualmente desde Supabase Dashboard
-- o usando la función delete-account con service role
