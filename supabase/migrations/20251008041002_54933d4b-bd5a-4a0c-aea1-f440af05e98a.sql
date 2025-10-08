-- Actualizar teléfonos de México (todos excepto el que empieza con 425)
UPDATE profiles 
SET telefono = '+52' || telefono 
WHERE telefono NOT LIKE '+%' 
  AND telefono NOT LIKE '425%'
  AND telefono IS NOT NULL;

-- Actualizar teléfono de Estados Unidos (el que empieza con 425)
UPDATE profiles 
SET telefono = '+1' || telefono 
WHERE telefono LIKE '425%' 
  AND telefono NOT LIKE '+%'
  AND telefono IS NOT NULL;

-- También actualizar en la tabla proveedores
UPDATE proveedores 
SET telefono = '+52' || telefono 
WHERE telefono NOT LIKE '+%' 
  AND telefono NOT LIKE '425%'
  AND telefono IS NOT NULL;

UPDATE proveedores 
SET telefono = '+1' || telefono 
WHERE telefono LIKE '425%' 
  AND telefono NOT LIKE '+%'
  AND telefono IS NOT NULL;