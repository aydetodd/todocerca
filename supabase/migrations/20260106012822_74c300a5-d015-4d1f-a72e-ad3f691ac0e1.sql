-- Add "Cosas Extraviadas" to product_categories for search filtering
INSERT INTO public.product_categories (name, description)
VALUES ('Cosas Extraviadas', 'Objetos perdidos y encontrados por la comunidad')
ON CONFLICT DO NOTHING;