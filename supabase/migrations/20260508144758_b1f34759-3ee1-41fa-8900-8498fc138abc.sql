UPDATE public.favoritos f
SET tipo = 'ruta'
FROM public.productos p
WHERE f.producto_id = p.id
  AND f.tipo = 'producto'
  AND (
    p.route_type IN ('urbana', 'foranea', 'privada')
    OR p.is_private IS TRUE
  );