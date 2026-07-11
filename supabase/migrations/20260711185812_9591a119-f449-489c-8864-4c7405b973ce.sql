
ALTER TABLE public.user_contacts ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.find_user_by_phone(text);
DROP FUNCTION IF EXISTS public.add_contact_by_phone(text);

CREATE FUNCTION public.find_user_by_phone(_phone text)
RETURNS TABLE(user_id uuid, apodo text, nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.apodo, p.nombre
  FROM public.profiles p
  WHERE public.normalize_phone(_phone) <> ''
    AND (public.normalize_phone(p.telefono) = public.normalize_phone(_phone)
      OR public.normalize_phone(p.phone) = public.normalize_phone(_phone))
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO authenticated;

CREATE FUNCTION public.add_contact_by_phone(_phone text)
RETURNS TABLE(user_id uuid, apodo text, nombre text, blocked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _target uuid; _apodo text; _nombre text; _blocked boolean := false;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT p.user_id, p.apodo, p.nombre INTO _target, _apodo, _nombre
  FROM public.profiles p
  WHERE public.normalize_phone(_phone) <> ''
    AND (public.normalize_phone(p.telefono) = public.normalize_phone(_phone)
      OR public.normalize_phone(p.phone) = public.normalize_phone(_phone))
  LIMIT 1;
  IF _target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF _target = _me THEN RAISE EXCEPTION 'cannot_add_self'; END IF;

  INSERT INTO public.user_contacts (user_id, contact_user_id) VALUES (_me, _target) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_contacts (user_id, contact_user_id) VALUES (_target, _me) ON CONFLICT DO NOTHING;

  SELECT uc.blocked INTO _blocked FROM public.user_contacts uc
  WHERE uc.user_id = _me AND uc.contact_user_id = _target;

  RETURN QUERY SELECT _target, _apodo, _nombre, COALESCE(_blocked, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_contact_by_phone(text) TO authenticated;
