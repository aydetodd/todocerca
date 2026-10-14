CREATE OR REPLACE FUNCTION public.tg_colectivo_reset_aforo_al_cerrar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado <> 'en_curso' AND OLD.estado = 'en_curso' AND COALESCE(NEW.pasajeros_a_bordo,0) <> 0
     AND EXISTS (SELECT 1 FROM productos p WHERE p.id = NEW.producto_id AND p.route_type = 'taxi_colectivo') THEN
    NEW.pasajeros_a_bordo := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_colectivo_reset_aforo_al_cerrar ON public.viajes_realizados;
CREATE TRIGGER trg_colectivo_reset_aforo_al_cerrar BEFORE UPDATE OF estado ON public.viajes_realizados
FOR EACH ROW EXECUTE FUNCTION public.tg_colectivo_reset_aforo_al_cerrar();
UPDATE public.viajes_realizados v SET pasajeros_a_bordo = 0
FROM public.productos p WHERE p.id = v.producto_id AND p.route_type = 'taxi_colectivo'
  AND v.estado <> 'en_curso' AND COALESCE(v.pasajeros_a_bordo,0) <> 0;