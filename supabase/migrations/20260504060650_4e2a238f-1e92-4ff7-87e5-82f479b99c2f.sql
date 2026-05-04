DELETE FROM public.subscriptions WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id='2e22a8ee-860e-40d2-ac2e-419c67651135');
DELETE FROM public.unidades_empresa WHERE proveedor_id='a14f579a-152b-427c-904a-abf22f8cb3ba';
DELETE FROM public.proveedores WHERE id='a14f579a-152b-427c-904a-abf22f8cb3ba';