-- Limpiar las categorías existentes
TRUNCATE TABLE product_categories CASCADE;

-- Insertar las nuevas categorías
INSERT INTO product_categories (id, name, description) VALUES
  (gen_random_uuid(), 'Alimentos sin preparar', 'Productos alimenticios crudos o sin cocinar'),
  (gen_random_uuid(), 'Alimentos preparados', 'Comidas listas para consumir'),
  (gen_random_uuid(), 'Herramientas y máquinas', 'Equipos, herramientas y maquinaria'),
  (gen_random_uuid(), 'Refacciones', 'Partes y repuestos'),
  (gen_random_uuid(), 'Taxi', 'Servicios de transporte de pasajeros'),
  (gen_random_uuid(), 'Hospedaje', 'Alojamiento y hospedaje'),
  (gen_random_uuid(), 'Rentas', 'Servicios de renta y alquiler'),
  (gen_random_uuid(), 'Cosas gratis', 'Artículos y servicios gratuitos'),
  (gen_random_uuid(), 'Vacantes', 'Ofertas de empleo'),
  (gen_random_uuid(), 'Profesiones y oficios', 'Servicios profesionales y técnicos'),
  (gen_random_uuid(), 'Otros', 'Otras categorías (especifique en la descripción del producto)');
