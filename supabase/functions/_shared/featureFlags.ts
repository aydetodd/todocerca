// Interruptores globales (feature flags) del backend.
// Mantienen el código existente intacto, solo lo desactivan temporalmente.

/** Retiros en efectivo (OXXO) y a banco (SPEI): apagados hasta integrar el nuevo proveedor. */
export const RETIROS_STP_ENABLED = false;

/** Métodos de retiro bloqueados mientras RETIROS_STP_ENABLED sea false. */
export const METODOS_RETIRO_BLOQUEADOS = ["oxxo", "spei"];

export const MENSAJE_RETIRO_BLOQUEADO =
  "Los retiros en efectivo (OXXO) y a cuenta bancaria (SPEI) estarán disponibles próximamente, cuando se active el nuevo proveedor de pagos. Por ahora puedes transferir gratis a cualquier tarjeta QaRd.";
