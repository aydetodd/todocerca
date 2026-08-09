update public.profiles set estado='available', tarifa_km=12.5
 where user_id in ('00374a41-1afd-45cc-964b-7e26191e4afa','ee33829d-f230-4223-b26f-3c93c25fb41e','5dd8790c-6dcf-47ed-a677-0d61582d5e88','bef401bb-ec41-48ef-87b6-efa704bd3bb2','627cc11f-d8eb-42b3-99eb-335ab7edb6e7');

insert into public.proveedores (user_id, nombre, latitude, longitude, description)
values
 ('00374a41-1afd-45cc-964b-7e26191e4afa','Taxi Sonora 12',29.0790,-110.9590,'DEMO'),
 ('ee33829d-f230-4223-b26f-3c93c25fb41e','Radio Taxi Centro',29.0705,-110.9640,'DEMO'),
 ('5dd8790c-6dcf-47ed-a677-0d61582d5e88','Taxi Kino Express',29.0860,-110.9500,'DEMO'),
 ('bef401bb-ec41-48ef-87b6-efa704bd3bb2','Taxi Pitic',29.0640,-110.9530,'DEMO'),
 ('627cc11f-d8eb-42b3-99eb-335ab7edb6e7','Taxi Solidaridad',29.0930,-110.9700,'DEMO');

insert into public.proveedor_locations (user_id, latitude, longitude, updated_at)
values
 ('00374a41-1afd-45cc-964b-7e26191e4afa',29.0790,-110.9590, now()),
 ('ee33829d-f230-4223-b26f-3c93c25fb41e',29.0705,-110.9640, now()),
 ('5dd8790c-6dcf-47ed-a677-0d61582d5e88',29.0860,-110.9500, now()),
 ('bef401bb-ec41-48ef-87b6-efa704bd3bb2',29.0640,-110.9530, now()),
 ('627cc11f-d8eb-42b3-99eb-335ab7edb6e7',29.0930,-110.9700, now());

insert into public.productos (proveedor_id, nombre, descripcion, precio, stock, route_type, is_available, estado, ciudad, pais, keywords)
select pr.id, 'Servicio de Taxi', 'DEMO Taxi seguro 24/7', 45, 1, 'taxi', true, 'Sonora','Hermosillo','MX','taxi'
from public.proveedores pr where pr.description='DEMO';