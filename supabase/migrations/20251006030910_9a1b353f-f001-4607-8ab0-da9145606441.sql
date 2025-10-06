-- Update handle_new_user function to include apodo field
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, nombre, apodo, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
        COALESCE(NEW.raw_user_meta_data->>'apodo', NEW.raw_user_meta_data->>'nombre', 'Usuario'),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cliente')
    );
    RETURN NEW;
END;
$function$;