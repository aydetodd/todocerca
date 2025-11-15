-- Cambiar usuario de admin a proveedor
UPDATE profiles 
SET role = 'proveedor'
WHERE user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';