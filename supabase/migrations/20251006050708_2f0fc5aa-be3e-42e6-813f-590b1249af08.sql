
-- Corregir la precisión de las columnas de coordenadas en la tabla proveedores
-- Las coordenadas necesitan NUMERIC(10, 7) para soportar valores como -180.0000000 a 180.0000000

ALTER TABLE proveedores 
ALTER COLUMN latitude TYPE NUMERIC(10, 7);

ALTER TABLE proveedores 
ALTER COLUMN longitude TYPE NUMERIC(10, 7);
