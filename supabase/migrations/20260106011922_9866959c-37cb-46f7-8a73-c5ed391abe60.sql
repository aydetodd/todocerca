-- Create category for lost/found items
INSERT INTO categories (name, icon, is_product, parent_id)
VALUES ('Cosas Extraviadas', '🔍', true, NULL)
ON CONFLICT DO NOTHING;