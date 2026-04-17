TRUNCATE TABLE 
  public.logs_validacion_qr,
  public.movimientos_boleto,
  public.intentos_fraude,
  public.qr_tickets,
  public.items_pedido,
  public.pedidos,
  public.liquidaciones_diarias,
  public.asignaciones_chofer,
  public.cortes_transporte,
  public.audit_log_verificacion
RESTART IDENTITY CASCADE;

UPDATE public.cuentas_boletos SET ticket_count = 0, total_comprado = 0, total_usado = 0;