
-- Limpieza de datos de prueba: conservar solo rutas públicas urbanas/foráneas
DELETE FROM public.movimientos_boleto;
DELETE FROM public.qr_tickets;
UPDATE public.cuentas_boletos SET ticket_count = 0, total_usado = 0;

DELETE FROM public.asignaciones_chofer;
DELETE FROM public.choferes_empresa;
DELETE FROM public.unidades_empresa;

DELETE FROM public.route_passenger_access;
DELETE FROM public.ruta_invitaciones;

DELETE FROM public.productos
WHERE route_type = 'privada' OR is_private = true;

DELETE FROM public.proveedor_locations;
