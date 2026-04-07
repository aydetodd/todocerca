-- Backfill stripe_cuota_fija_unitario for tickets that have 0 or null
WITH batch_sizes AS (
  SELECT 
    user_id,
    date_trunc('second', created_at) AS batch_ts,
    COUNT(*) AS batch_count
  FROM qr_tickets
  WHERE stripe_cuota_fija_unitario IS NULL OR stripe_cuota_fija_unitario = 0
  GROUP BY user_id, date_trunc('second', created_at)
),
tickets_to_update AS (
  SELECT 
    qt.id,
    3.00 / bs.batch_count AS new_cuota_fija
  FROM qr_tickets qt
  JOIN batch_sizes bs 
    ON qt.user_id = bs.user_id 
    AND date_trunc('second', qt.created_at) = bs.batch_ts
  WHERE qt.stripe_cuota_fija_unitario IS NULL OR qt.stripe_cuota_fija_unitario = 0
)
UPDATE qr_tickets 
SET stripe_cuota_fija_unitario = tickets_to_update.new_cuota_fija
FROM tickets_to_update
WHERE qr_tickets.id = tickets_to_update.id;

-- Also backfill stripe_fee_unitario
UPDATE qr_tickets
SET stripe_fee_unitario = (amount * 0.036) + stripe_cuota_fija_unitario
WHERE stripe_fee_unitario IS NULL OR stripe_fee_unitario = 0;