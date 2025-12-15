-- Insertar la categoría "Rutas de Transporte" para productos de rutas urbanas
INSERT INTO product_categories (name, description)
VALUES ('Rutas de Transporte', 'Servicios de transporte urbano (rutas de autobús)')
ON CONFLICT DO NOTHING;