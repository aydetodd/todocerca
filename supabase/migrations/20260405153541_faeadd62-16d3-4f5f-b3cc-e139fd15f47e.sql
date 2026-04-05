-- Backfill: for tickets from purchases where stripe_fee was 0 (test mode), 
-- estimate based on standard rates: (3.6% * $9.00 + $3.00/qty) per ticket
UPDATE public.qr_tickets qt
SET stripe_fee_unitario = COALESCE(
  (
    SELECT t.stripe_fee / NULLIF(t.cantidad_boletos, 0)
    FROM transacciones_boletos t
    WHERE t.tipo = 'compra' 
      AND t.estado = 'completado'
      AND t.user_id = qt.user_id
      AND t.created_at <= qt.created_at + interval '1 minute'
      AND t.created_at >= qt.created_at - interval '1 minute'
    ORDER BY t.created_at DESC
    LIMIT 1
  ),
  -- Fallback estimate: assume 10-ticket purchase = ($9*0.036 + $3/10) = $0.624
  0.624
)
WHERE stripe_fee_unitario = 0 OR stripe_fee_unitario IS NULL;