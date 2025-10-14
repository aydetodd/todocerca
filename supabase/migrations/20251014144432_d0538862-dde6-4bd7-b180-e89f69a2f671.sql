-- Add cliente_user_id to pedidos table to link orders with authenticated users
ALTER TABLE pedidos ADD COLUMN cliente_user_id uuid REFERENCES auth.users(id);

-- Create index for better query performance
CREATE INDEX idx_pedidos_cliente_user_id ON pedidos(cliente_user_id);

-- Update RLS policies to allow users to view their own orders
CREATE POLICY "Clientes pueden ver sus propios pedidos"
ON pedidos FOR SELECT
USING (auth.uid() = cliente_user_id OR is_admin());