
-- Limpiar liquidaciones
DELETE FROM liquidaciones_diarias;

-- Limpiar intentos de fraude
DELETE FROM intentos_fraude;

-- Limpiar logs de validación
DELETE FROM logs_validacion_qr;

-- Limpiar transacciones de boletos
DELETE FROM transacciones_boletos;

-- Limpiar tickets QR
DELETE FROM qr_tickets;

-- Resetear cuentas de boletos a cero
UPDATE cuentas_boletos SET ticket_count = 0, total_comprado = 0, total_usado = 0, updated_at = now();
