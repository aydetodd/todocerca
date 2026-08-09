set local request.jwt.claims = '{"sub":"2e22a8ee-860e-40d2-ac2e-419c67651135","role":"authenticated"}';
insert into public.citizen_reports (user_id, category, lat, lng, note, phone_last4, status, confirm_count, city, created_at)
values
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','bache',29.0760,-110.9600,'Bache grande sobre Blvd. Luis Encinas','1234','active',7,'Hermosillo', now()-interval '2 hours'),
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','alumbrado',29.0830,-110.9520,'Poste sin luz frente al parque','1234','active',4,'Hermosillo', now()-interval '5 hours'),
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','fuga_agua',29.0690,-110.9700,'Fuga de agua en la banqueta','1234','active',12,'Hermosillo', now()-interval '1 day'),
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','basura',29.0900,-110.9640,'Basura acumulada en la esquina','1234','active',3,'Hermosillo', now()-interval '8 hours'),
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','semaforo',29.0730,-110.9480,'Semáforo intermitente todo el día','1234','active',9,'Hermosillo', now()-interval '3 hours'),
 ('2e22a8ee-860e-40d2-ac2e-419c67651135','fuga_drenaje',29.0650,-110.9550,'Drenaje colapsado, mal olor','1234','active',6,'Hermosillo', now()-interval '2 days');