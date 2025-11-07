-- Agregar campo is_mobile a la tabla productos
ALTER TABLE productos ADD COLUMN is_mobile boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN productos.is_mobile IS 'Indica si el producto se vende en ubicación móvil (vendedor ambulante) o fija';