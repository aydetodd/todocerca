// Formatea el número QaRd de 16 dígitos como "#### #### #### ####".
// Este número es TAMBIÉN el ID de Usuario (mismo para cliente/proveedor, sin sufijos p/c).
export function formatQardNumber(qard?: string | null, consecutive?: number | null): string {
  const digits = (qard || "").replace(/\D/g, "");
  if (digits.length === 16) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
  }
  // Fallback mientras el trigger asigna el número
  if (consecutive != null) return String(consecutive).padStart(6, "0");
  return "—";
}
