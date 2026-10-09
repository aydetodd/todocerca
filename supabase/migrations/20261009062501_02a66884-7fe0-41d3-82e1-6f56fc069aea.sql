DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('get_public_route_live_units','get_route_live_units','get_public_routes_with_live_units')
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'IN (''urbana'', ''foranea'')', 'IN (''urbana'', ''foranea'', ''taxi_colectivo'')');
    EXECUTE d;
  END LOOP;
END $$;