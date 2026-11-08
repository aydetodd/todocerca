import type { MovBase } from "./qardEtiquetas";

export type RefundRequest = {
  id: string; original_folio: string; requested_amount: number; approved_amount: number | null;
  reason: string; decision_reason: string | null; status: "pending" | "completed" | "rejected";
  created_at: string; can_authorize?: boolean;
};
export type RefundContext = {
  original_folio: string; original_amount: number; remaining: number; can_authorize: boolean;
  requests: RefundRequest[];
};
export const refundStatus = { pending: "Pendiente de autorización", completed: "Completado", rejected: "Rechazado" };
export function refundableMovement(m: MovBase): boolean {
  return ["cobro_comercio", "cobro_recibido"].includes(m.tipo)
    && typeof m.metadata?.operation_key === "string"
    && (m.metadata.terminal === "collection" || m.metadata.flujo === "payer_qr");
}
export function refundAmount(value: string, maximum: number): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) <= Math.round(maximum * 100) ? amount : null;
}