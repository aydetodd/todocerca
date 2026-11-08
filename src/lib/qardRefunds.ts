import type { MovBase } from "./qardEtiquetas";

export type RefundRequest = {
  id: string; original_folio: string; requested_amount: number; approved_amount: number | null;
  reason: string; decision_reason: string | null; status: "pending" | "completed" | "rejected" | "timed_out" | "cancelled" | "disputed" | "dispute_rejected";
  created_at: string; expires_at: string; dispute_reason?: string; can_authorize?: boolean;
};
export type RefundContext = {
  original_folio: string; original_amount: number; remaining: number; can_authorize: boolean;
  requests: RefundRequest[];
};
export const refundStatus = { pending: "Pendiente de autorización", completed: "Completado", rejected: "Rechazado", timed_out: "Rechazada por timeout", cancelled: "Cancelada por el cliente", disputed: "Disputa activa · importe congelado", dispute_rejected: "Disputa resuelta sin devolución" };
export function refundActions(r: Pick<RefundRequest, "status" | "expires_at" | "can_authorize">, now = Date.now()) {
  const expired = r.status === "pending" && new Date(r.expires_at).getTime() <= now;
  return { cancel: !r.can_authorize && r.status === "pending" && !expired, dispute: !r.can_authorize && (["rejected", "timed_out"].includes(r.status) || expired), decide: !!r.can_authorize && r.status === "pending" && !expired };
}
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