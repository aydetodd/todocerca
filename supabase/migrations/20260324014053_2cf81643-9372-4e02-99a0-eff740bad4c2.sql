-- Insert the missing cuentas_conectadas record
INSERT INTO public.cuentas_conectadas (concesionario_id, stripe_account_id, estado_stripe, pagos_habilitados, transferencias_habilitadas)
VALUES ('3f143b29-8138-48b1-999b-396559ab35fc', 'acct_1TDwLcK1c3N0d8AC', 'pending', false, false)
ON CONFLICT (concesionario_id) DO UPDATE SET
  stripe_account_id = EXCLUDED.stripe_account_id,
  updated_at = now();

-- Add RLS policy for concesionarios to read logs_validacion_qr for their own units
CREATE POLICY "Concesionarios ven logs de sus unidades"
  ON public.logs_validacion_qr
  FOR SELECT
  TO authenticated
  USING (
    unidad_id IN (
      SELECT ue.id FROM unidades_empresa ue
      JOIN proveedores p ON p.id = ue.proveedor_id
      WHERE p.user_id = auth.uid()
    )
  );