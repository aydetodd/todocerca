
-- Limpiar en orden correcto por dependencias de FK
DELETE FROM movimientos_boleto;
DELETE FROM logs_validacion_qr;
DELETE FROM intentos_fraude;
DELETE FROM liquidaciones_diarias;
DELETE FROM qr_tickets;

-- Resetear contadores de cuentas de boletos a 0
UPDATE cuentas_boletos SET ticket_count = 0, total_comprado = 0, total_usado = 0, updated_at = now();
