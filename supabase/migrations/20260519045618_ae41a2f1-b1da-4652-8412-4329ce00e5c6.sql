-- Limpieza total de datos de concesionarios, conservando catálogo de rutas públicas
DELETE FROM movimientos_boleto;
DELETE FROM qr_tickets;
UPDATE cuentas_boletos SET ticket_count = 0, total_usado = 0;
DELETE FROM cuentas_boletos;
DELETE FROM asignaciones_chofer;
DELETE FROM choferes_empresa;
DELETE FROM unidades_empresa;
DELETE FROM route_passenger_access;
DELETE FROM ruta_invitaciones;
DELETE FROM proveedor_locations;
DELETE FROM subscriptions;
-- Borrar rutas privadas / foráneas / taxi, conservar SOLO catálogo público urbano
DELETE FROM productos WHERE route_type <> 'urbana' OR is_private = true;