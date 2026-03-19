-- Delete old test validation logs that don't have a producto_id (created before route tracking was added)
DELETE FROM logs_validacion_qr WHERE producto_id IS NULL;