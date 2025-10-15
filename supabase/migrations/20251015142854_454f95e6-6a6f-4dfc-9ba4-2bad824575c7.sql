-- Eliminar usuario 16p (Los portales) que no se registró correctamente
-- user_id: 3d3fd1bc-69e8-42ea-b09a-b29a91dca697

-- Primero eliminar items de pedidos relacionados
DELETE FROM items_pedido WHERE pedido_id IN (
  SELECT id FROM pedidos WHERE cliente_user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
);

-- Eliminar pedidos del cliente
DELETE FROM pedidos WHERE cliente_user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';

-- Eliminar items de pedidos de productos del proveedor
DELETE FROM items_pedido WHERE pedido_id IN (
  SELECT id FROM pedidos WHERE proveedor_id IN (
    SELECT id FROM proveedores WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
  )
);

-- Eliminar pedidos del proveedor
DELETE FROM pedidos WHERE proveedor_id IN (
  SELECT id FROM proveedores WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
);

-- Eliminar fotos de productos
DELETE FROM fotos_productos WHERE producto_id IN (
  SELECT id FROM productos WHERE proveedor_id IN (
    SELECT id FROM proveedores WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
  )
);

-- Eliminar productos
DELETE FROM productos WHERE proveedor_id IN (
  SELECT id FROM proveedores WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
);

-- Eliminar proveedor
DELETE FROM proveedores WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';

-- Eliminar ubicaciones del proveedor
DELETE FROM proveedor_locations WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';

-- Eliminar mensajes
DELETE FROM messages WHERE sender_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697' OR receiver_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';

DELETE FROM chats WHERE sender_id IN (
  SELECT id FROM profiles WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
) OR receiver_id IN (
  SELECT id FROM profiles WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697'
);

-- Eliminar perfil
DELETE FROM profiles WHERE user_id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';

-- Finalmente eliminar el usuario de auth
DELETE FROM auth.users WHERE id = '3d3fd1bc-69e8-42ea-b09a-b29a91dca697';