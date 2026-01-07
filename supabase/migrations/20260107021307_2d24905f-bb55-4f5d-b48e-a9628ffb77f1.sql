-- Primero eliminar comentarios relacionados
DELETE FROM listing_comments WHERE listing_id IN (
  SELECT id FROM listings WHERE expires_at > '2100-01-01'
);

-- Eliminar fotos relacionadas
DELETE FROM fotos_listings WHERE listing_id IN (
  SELECT id FROM listings WHERE expires_at > '2100-01-01'
);

-- Eliminar favoritos relacionados
DELETE FROM favoritos WHERE listing_id IN (
  SELECT id FROM listings WHERE expires_at > '2100-01-01'
);

-- Finalmente eliminar los listings
DELETE FROM listings WHERE expires_at > '2100-01-01';