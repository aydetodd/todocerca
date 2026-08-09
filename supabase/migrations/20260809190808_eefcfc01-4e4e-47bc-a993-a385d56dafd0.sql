DELETE FROM public.productos WHERE proveedor_id IN (SELECT id FROM public.proveedores WHERE description = 'DEMO');
DELETE FROM public.proveedor_locations WHERE user_id IN (SELECT user_id FROM public.proveedores WHERE description = 'DEMO');
DELETE FROM public.proveedores WHERE description = 'DEMO';
DELETE FROM public.citizen_reports WHERE city = 'Hermosillo' AND user_id = '2e22a8ee-860e-40d2-ac2e-419c67651135';