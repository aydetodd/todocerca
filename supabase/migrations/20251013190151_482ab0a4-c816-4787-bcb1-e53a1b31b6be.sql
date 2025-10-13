-- Agregar columnas para trackear el status de cada paso del pedido
ALTER TABLE pedidos 
ADD COLUMN IF NOT EXISTS impreso boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pagado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS preparado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS entregado boolean DEFAULT false;