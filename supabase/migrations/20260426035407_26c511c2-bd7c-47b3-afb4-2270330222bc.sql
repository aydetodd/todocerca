-- Actualizar teléfono del usuario #1 (Martin) sin afectar consecutive_number
UPDATE public.profiles
SET telefono = '+526624124381',
    updated_at = now()
WHERE user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';

-- Actualizar también en auth.users para login por SMS futuro
UPDATE auth.users
SET phone = '526624124381',
    phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
    updated_at = now()
WHERE id = '2e22a8ee-860e-40d2-ac2e-419c67651135';

-- Limpiar dispositivos confiables previos para que el nuevo móvil pase por verificación limpia
DELETE FROM public.trusted_devices
WHERE user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';

DELETE FROM public.device_verification_codes
WHERE user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';