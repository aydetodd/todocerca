import { test } from "node:test";
import { strict as assert } from "node:assert";
import { refundAmount, refundableMovement } from "./qardRefunds";
import { construirLibro, type MovBase } from "./qardEtiquetas";

const payment: MovBase = { id: "original", tipo: "cobro_comercio", monto_mxn: 500, sub_qr_id: "personal", descripcion: null, created_at: "2026-11-08T16:15:00Z", metadata: { operation_key: "abc", terminal: "collection" } };
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