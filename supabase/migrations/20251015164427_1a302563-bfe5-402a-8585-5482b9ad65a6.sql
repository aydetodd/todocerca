-- Agregar categoría Artesanía y reorganizar el orden
-- Primero limpiamos y recreamos las categorías con el orden correcto

TRUNCATE TABLE product_categories CASCADE;

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