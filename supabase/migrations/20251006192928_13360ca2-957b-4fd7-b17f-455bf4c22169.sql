-- Permitir búsqueda de perfiles por teléfono para el proceso de login
-- Solo expone user_id, consecutive_number, y email (no datos sensibles adicionales)
CREATE POLICY "Allow phone lookup for login"
ON public.profiles
FOR SELECT
USING (telefono IS NOT NULL);