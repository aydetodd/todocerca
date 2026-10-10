ALTER TABLE public.rutas_foraneas_maestras
  ADD COLUMN IF NOT EXISTS last_edited_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_rutas_maestras_before_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  NEW.nombre := btrim(NEW.nombre);
  NEW.nombre_normalizado := public.normalize_route_name(NEW.nombre);
  IF NEW.nombre_normalizado = '' THEN
    RAISE EXCEPTION 'El nombre de la ruta no puede estar vacío';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.estado := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    NEW.last_edited_by_user_id := auth.uid();
    NEW.last_edited_at := now();
  END IF;
  RETURN NEW;
END;
$function$;