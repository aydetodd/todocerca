UPDATE qr_tickets 
SET stripe_fee_unitario = 0.624 
WHERE stripe_fee_unitario = 0 AND amount = 9.00;

UPDATE transacciones_boletos 
SET stripe_fee = 6.24 
WHERE stripe_fee = 0 AND cantidad_boletos = 10 AND tipo = 'compra';

UPDATE liquidaciones_diarias 
SET monto_fee_stripe_connect = 4.992,
    monto_neto = monto_valor_facial - monto_comision_todocerca - 4.992
WHERE total_boletos = 8 AND monto_fee_stripe_connect = 5.59;