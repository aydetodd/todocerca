-- Mejorar trigger para incluir teléfono automáticamente desde metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, nombre, apodo, role, telefono, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
        COALESCE(NEW.raw_user_meta_data->>'apodo', NEW.raw_user_meta_data->>'nombre', 'Usuario'),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cliente'),
        NEW.raw_user_meta_data->>'telefono',
        NEW.email
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't block signup
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;