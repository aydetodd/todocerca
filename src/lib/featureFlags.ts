// Interruptores globales (feature flags) del frontend.
// Permiten apagar funciones sin borrar código.

/** Retiros en efectivo (OXXO) y a banco (SPEI): apagados hasta activar el nuevo proveedor de pagos. */
export const RETIROS_STP_ENABLED = false;

export const MENSAJE_RETIRO_PROXIMAMENTE =
  "Próximamente: los retiros en efectivo (OXXO) y a cuenta bancaria (SPEI) se activarán cuando entre el nuevo proveedor de pagos. Mientras tanto, puedes transferir gratis a cualquier tarjeta QaRd.";

/** Módulos en pausa (Protocolo movilidad + QaRd). No se borra su código, solo se oculta el acceso. */
export const MODULOS_OCULTOS = {
  taxi: true,
  votaciones: true,
  sos: true,
  tv: true,
  domotica: true,
  reportesCiudadanos: true,
};
