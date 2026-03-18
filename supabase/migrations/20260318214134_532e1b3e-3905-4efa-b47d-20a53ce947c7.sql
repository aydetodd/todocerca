
-- Limpiar en orden correcto por dependencias de foreign keys
DELETE FROM intentos_fraude;
DELETE FROM logs_validacion_qr;
DELETE FROM transacciones_boletos;
DELETE FROM qr_tickets;
DELETE FROM cuentas_boletos;
