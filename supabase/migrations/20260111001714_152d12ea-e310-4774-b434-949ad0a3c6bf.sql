-- Eliminar datos de la cuenta de Adriana (tel: 6627151832)

-- Eliminar mensajes
DELETE FROM messages WHERE sender_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar chats
DELETE FROM chats WHERE sender_id = '5f5bdd0b-5593-4267-ab44-05fbf0396146' OR receiver_id = '5f5bdd0b-5593-4267-ab44-05fbf0396146';

-- Eliminar favoritos
DELETE FROM favoritos WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar contactos
DELETE FROM user_contacts WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc' OR contact_user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar ubicaciones de proveedor
DELETE FROM proveedor_locations WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar tracking member locations
DELETE FROM tracking_member_locations WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar tracking group members
DELETE FROM tracking_group_members WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar cliente
DELETE FROM clientes WHERE user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar pedidos donde es cliente
DELETE FROM pedidos WHERE cliente_user_id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';

-- Eliminar subscriptions
DELETE FROM subscriptions WHERE profile_id = '5f5bdd0b-5593-4267-ab44-05fbf0396146';

-- Eliminar tracking devices
DELETE FROM tracking_devices WHERE profile_id = '5f5bdd0b-5593-4267-ab44-05fbf0396146';

-- Eliminar profile
DELETE FROM profiles WHERE id = '5f5bdd0b-5593-4267-ab44-05fbf0396146';

-- Eliminar usuario de auth
DELETE FROM auth.users WHERE id = 'a2d23c69-303a-41b4-9403-0ca242b5e7dc';