-- Insertar suscripción para el usuario Beto (6442296973)
-- Esta es una suscripción anual de $200 con Stripe

INSERT INTO subscriptions (profile_id, status, start_date, end_date, amount, currency, payment_method, stripe_subscription_id)
VALUES (
  'f05c84f6-b69c-4e6b-b77c-9a897dfe9c36', -- profile_id de Beto
  'activa',
  NOW(),
  NOW() + INTERVAL '1 year',
  200.00,
  'MXN',
  'stripe',
  'sub_manual_beto_taxi' -- Identificador temporal hasta sincronizar con Stripe
)
ON CONFLICT DO NOTHING;