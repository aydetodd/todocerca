-- Actualizar el orden de las categorías para mover "Otros" al final
-- Primero eliminamos y recreamos con el orden correcto

DELETE FROM product_categories;

INSERT INTO product_categories (name, description) VALUES
  ('Alimentos sin preparar', 'Ingredientes crudos y productos frescos'),
  ('Alimentos preparados', 'Comidas listas para consumir'),
  ('Artesanías', 'Productos hechos a mano y trabajos artesanales'),
  ('Herramientas y máquinas', 'Equipos y herramientas de trabajo'),
  ('Refacciones', 'Partes y componentes de repuesto'),
  ('Taxi', 'Servicios de transporte'),
  ('Hospedaje', 'Alojamiento y estancias'),
  ('Rentas', 'Alquiler de bienes y espacios'),
  ('Cosas gratis', 'Artículos sin costo'),
  ('Vacantes', 'Ofertas de empleo'),
  ('Profesiones y oficios', 'Servicios profesionales y técnicos'),
  ('Otros', 'Otras categorías no especificadas');