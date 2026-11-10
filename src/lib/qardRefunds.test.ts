import { test } from "node:test";
import { strict as assert } from "node:assert";
import { claimIneligibility, withinRefundWindow, refundActions, refundAmount, refundableMovement, type RefundContext } from "./qardRefunds";
import { construirLibro, type MovBase } from "./qardEtiquetas";

const payment: MovBase = { id: "original", tipo: "cobro_comercio", monto_mxn: 500, sub_qr_id: "personal", descripcion: null, created_at: "2026-11-08T16:15:00Z", metadata: { operation_key: "abc", terminal: "collection" } };
const expiry = "2026-11-11T16:15:00Z";
test("48 horas exactas permiten reclamar; un milisegundo después no", () => {
  const boundary = Date.parse(payment.created_at) + 48 * 60 * 60 * 1000;
  assert.equal(withinRefundWindow(payment.created_at, boundary), true);
  assert.equal(withinRefundWindow(payment.created_at, boundary + 1), false);
});
test("una reclamación registrada bloquea otra incluso cancelada o parcial", () => {
  const context: RefundContext = { original_folio: "QRD-20261108-ABC123", original_amount: 500, remaining: 300, can_authorize: false, original_created_at: payment.created_at, request_deadline: "2026-11-10T16:15:00Z", requests: [] };
  const now = Date.parse(payment.created_at) + 1000;
  assert.equal(claimIneligibility(context, now), null);
  for (const status of ["pending", "completed", "cancelled", "rejected"] as const) {
    assert.match(claimIneligibility({ ...context, requests: [{ id: "request", original_folio: context.original_folio, requested_amount: 500, approved_amount: status === "completed" ? 200 : null, reason: "Producto devuelto", decision_reason: null, status, created_at: payment.created_at, expires_at: expiry }] }, now) ?? "", /reclamación registrada/);
  }
});
test("antes de 72 horas el cliente puede cancelar y el dueño decidir", () => {
  const before = Date.parse(expiry) - 1;
  assert.equal(refundActions({ status: "pending", expires_at: expiry, can_authorize: false }, before).cancel, true);
  assert.equal(refundActions({ status: "pending", expires_at: expiry, can_authorize: true }, before).decide, true);
});
test("a las 72 horas solo queda disputa para el cliente, no decisión tardía", () => {
  assert.equal(Date.parse(expiry) - Date.parse(payment.created_at), 72 * 60 * 60 * 1000);
  assert.deepEqual(refundActions({ status: "pending", expires_at: expiry, can_authorize: false }, Date.parse(expiry)), { cancel: false, dispute: true, decide: false });
  assert.equal(refundActions({ status: "pending", expires_at: expiry, can_authorize: true }, Date.parse(expiry)).decide, false);
});
test("rechazo permite disputa, cancelación y devolución completada no", () => {
  assert.equal(refundActions({ status: "rejected", expires_at: expiry }).dispute, true);
  for (const status of ["cancelled", "completed", "disputed"] as const) assert.deepEqual(refundActions({ status, expires_at: expiry }), { cancel: false, dispute: false, decide: false });
});
test("al devolver los 500 completos no queda ni un centavo disponible", () => {
  assert.equal(refundAmount("0.01", 500 - 200 - 100 - 200), null);
});
test("500 cobrados, 200 devueltos: solo quedan 300, ni un centavo más", () => {
  assert.equal(refundAmount("300", 500 - 200), 300);
  assert.equal(refundAmount("300.01", 500 - 200), null);
});
test("no se devuelve cero, negativo ni fracciones de centavo", () => {
  for (const amount of ["0", "-200", "1.001", "NaN", "Infinity"]) assert.equal(refundAmount(amount, 500), null);
});
test("solo cobros comerciales originales, nunca transporte ni transferencias", () => {
  assert.equal(refundableMovement(payment), true);
  assert.equal(refundableMovement({ ...payment, metadata: {} }), false);
  assert.equal(refundableMovement({ ...payment, tipo: "transferencia_p2p_out" }), false);
  assert.equal(construirLibro([payment], "personal")[0].refundMovementId, "original");
});
for (const [amb, sub, md] of [["eje", "personal", {}], ["sub_qr", "family", {}], ["cobros", "business", { bolsa: "comercio" }]] as const) {
  test(`retorno 200 a ${amb}, salida empresarial 200 y mismo folio`, () => {
    const refund: MovBase = { ...payment, id: "refund", tipo: "devolucion", monto_mxn: -200, sub_qr_id: sub, ambito: amb, metadata: { ...md, original_folio: "QRD-20261108-ABC123", operation_key: "return", reason: "Producto devuelto", refund_received: true } };
    const received = construirLibro([refund], "personal")[0];
    const sent = construirLibro([{ ...refund, sub_qr_id: null, ambito: "cobros", metadata: { ...refund.metadata, bolsa: "comercio", refund_received: false } }], "personal")[0];
    assert.equal(received.ambito, amb); assert.equal(received.monto, 200);
    assert.equal(sent.monto, -200); assert.equal(received.monto + sent.monto, 0);
    assert.equal(received.folio, sent.folio); assert.equal(received.estado, "Completado");
    assert.equal(received.importeReferencia, -200);
  });
}