-- ===== DEFAULT SERVICE CATEGORIES =====
-- Run this AFTER the main schema

-- Insert default service categories (hierarchical structure)
-- Main categories
INSERT INTO service_categories (id, name, slug, parent_id, category_type, sort_order) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Bienes', 'bienes', NULL, 'bien', 1),
    ('22222222-2222-2222-2222-222222222222', 'Servicios', 'servicios', NULL, 'servicio', 2);

-- Bienes subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) VALUES
    ('Alimentos', 'alimentos', '11111111-1111-1111-1111-111111111111', 'bien', 1),
    ('Herramientas', 'herramientas', '11111111-1111-1111-1111-111111111111', 'bien', 2),
    ('Hogar', 'hogar', '11111111-1111-1111-1111-111111111111', 'bien', 3),
    ('Taller', 'taller', '11111111-1111-1111-1111-111111111111', 'bien', 4),
    ('Deportes', 'deportes', '11111111-1111-1111-1111-111111111111', 'bien', 5);

-- Servicios subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) VALUES
    ('Hospedaje', 'hospedaje', '22222222-2222-2222-2222-222222222222', 'servicio', 1),
    ('Transporte', 'transporte', '22222222-2222-2222-2222-222222222222', 'servicio', 2),
    ('Electricista', 'electricista', '22222222-2222-2222-2222-222222222222', 'servicio', 3),
    ('Plomero', 'plomero', '22222222-2222-2222-2222-222222222222', 'servicio', 4),
    ('Instructor', 'instructor', '22222222-2222-2222-2222-222222222222', 'servicio', 5),
    ('Empleos', 'empleos', '22222222-2222-2222-2222-222222222222', 'servicio', 6);

-- Alimentos subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Tacos', 'tacos', id, 'bien', 1 FROM service_categories WHERE slug = 'alimentos';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Pizzas', 'pizzas', id, 'bien', 2 FROM service_categories WHERE slug = 'alimentos';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Comida Casera', 'comida-casera', id, 'bien', 3 FROM service_categories WHERE slug = 'alimentos';

-- Tacos subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Tacos de Pastor', 'tacos-pastor', id, 'bien', 1 FROM service_categories WHERE slug = 'tacos';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Tacos de Pescado', 'tacos-pescado', id, 'bien', 2 FROM service_categories WHERE slug = 'tacos';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Tacos de Carnitas', 'tacos-carnitas', id, 'bien', 3 FROM service_categories WHERE slug = 'tacos';

-- Herramientas subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Eléctricas', 'herramientas-electricas', id, 'bien', 1 FROM service_categories WHERE slug = 'herramientas';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Manuales', 'herramientas-manuales', id, 'bien', 2 FROM service_categories WHERE slug = 'herramientas';

-- Transporte subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Taxis', 'taxis', id, 'servicio', 1 FROM service_categories WHERE slug = 'transporte';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Uber-like', 'uber-like', id, 'servicio', 2 FROM service_categories WHERE slug = 'transporte';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Mudanzas', 'mudanzas', id, 'servicio', 3 FROM service_categories WHERE slug = 'transporte';

-- Instructor subcategories
INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Música', 'musica', id, 'servicio', 1 FROM service_categories WHERE slug = 'instructor';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Idiomas', 'idiomas', id, 'servicio', 2 FROM service_categories WHERE slug = 'instructor';

INSERT INTO service_categories (name, slug, parent_id, category_type, sort_order) 
SELECT 'Deportes', 'instructor-deportes', id, 'servicio', 3 FROM service_categories WHERE slug = 'instructor';