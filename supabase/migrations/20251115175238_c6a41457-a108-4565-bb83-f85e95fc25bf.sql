-- Actualizar usuario a administrador
UPDATE profiles 
SET role = 'admin'
WHERE user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';