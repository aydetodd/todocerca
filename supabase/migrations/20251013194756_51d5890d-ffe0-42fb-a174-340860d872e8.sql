-- Agregar columna person_index a items_pedido para identificar a qué persona pertenece cada item
ALTER TABLE items_pedido 
ADD COLUMN IF NOT EXISTS person_index INTEGER DEFAULT 0 NOT NULL;