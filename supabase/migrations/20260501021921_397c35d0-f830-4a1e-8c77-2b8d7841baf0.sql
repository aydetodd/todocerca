CREATE OR REPLACE FUNCTION public.sync_concesionario_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IN ('approved', 'rejected') AND (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    UPDATE public.detalles_verificacion_unidad
    SET estado_verificacion = CASE WHEN NEW.estado = 'approved' THEN 'approved' ELSE 'rejected' END,
        updated_at = now()
    WHERE verificacion_id = NEW.id;

    UPDATE public.unidades_empresa
    SET is_verified = (NEW.estado = 'approved'),
        updated_at = now()
    WHERE proveedor_id = NEW.concesionario_id
      AND COALESCE(transport_type, '') <> 'taxi';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_concesionario_verification_status_trigger ON public.verificaciones_concesionario;

CREATE TRIGGER sync_concesionario_verification_status_trigger
AFTER UPDATE OF estado ON public.verificaciones_concesionario
FOR EACH ROW
EXECUTE FUNCTION public.sync_concesionario_verification_status();

UPDATE public.unidades_empresa ue
SET is_verified = (vc.estado = 'approved'),
    updated_at = now()
FROM public.verificaciones_concesionario vc
WHERE ue.proveedor_id = vc.concesionario_id
  AND COALESCE(ue.transport_type, '') <> 'taxi'
  AND vc.estado IN ('approved', 'rejected');