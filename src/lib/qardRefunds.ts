import type { MovBase } from "./qardEtiquetas";

export type RefundRequest = {
  id: string; original_folio: string; requested_amount: number; approved_amount: number | null;
  reason: string; decision_reason: string | null; status: "pending" | "completed" | "rejected" | "timed_out" | "cancelled" | "disputed" | "dispute_rejected";
  created_at: string; expires_at: string; dispute_reason?: string; remaining?: number; can_authorize?: boolean;
};
export type RefundContext = {
  original_folio: string; original_amount: number; remaining: number; frozen?: boolean; can_authorize: boolean;
  original_created_at: string; request_deadline: string;
  requests: RefundRequest[];
};
export type RefundPayment = { movement_id: string; original_folio: string; amount: number; created_at: string; source_ambito: string; source_sub_qr_id: string };
export const refundReasons = ["Producto devuelto", "Monto incorrecto", "Servicio cancelado", "Cobro duplicado", "Otro"];
export const refundExpiredMessage = "El plazo de 48 horas para solicitar una devolución sobre este cobro ha vencido. Para dudas, contacta directamente al comercio.";
export function withinRefundWindow(createdAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= 48 * 60 * 60 * 1000;
}
export function claimIneligibility(context: RefundContext, now = Date.now()): string | null {
  if (!withinRefundWindow(context.original_created_at, now)) return refundExpiredMessage;
  if (context.requests.length) return "Este cobro no es elegible porque ya tiene una reclamación registrada.";
  if (context.frozen) return "Este cobro no es elegible porque tiene una disputa activa.";
  if (Number(context.remaining) <= 0) return "Este cobro no es elegible porque ya se devolvió por completo.";
  return null;
}
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