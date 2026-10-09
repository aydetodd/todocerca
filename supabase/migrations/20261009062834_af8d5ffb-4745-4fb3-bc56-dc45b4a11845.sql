DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.link_producto_to_ruta_maestra'::regproc);
  d := replace(d, 'AND p.route_type = ''foranea''', 'AND p.route_type = COALESCE(_master.tipo, ''foranea'')');
  d := replace(d, 'o no es foránea', 'o no es del mismo tipo');
  EXECUTE d;
END $$;