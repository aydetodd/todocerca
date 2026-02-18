-- Fix existing taxi products: move them from "Rutas de Transporte" category to "Taxi" category
UPDATE productos 
SET category_id = '3d51a121-507b-41f5-9894-cf81cbec1c32' 
WHERE route_type = 'taxi' 
AND category_id = 'd56476ed-432b-44ad-ad7f-daeaec0d2da7';