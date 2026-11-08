import { test } from "node:test";
import { strict as assert } from "node:assert";
import { construirLibro, estadoDeCuenta, type MovBase } from "./qardEtiquetas";
import { statementSummary, maskedQard } from "./qardStatement";

const base: MovBase = { id: "a", tipo: "devolucion", monto_mxn: -100, descripcion: null, sub_qr_id: null, created_at: "2026-11-08T13:31:00Z", metadata: { original_folio: "QRD-20261107-ABC123", refund_received: true } };
for (const [amb, subId, md] of [["eje", null, {}], ["cobros", "emp", { bolsa: "comercio" }], ["sub_qr", "fam", {}]] as const) {
  test(`devolución ${amb}: referencia negativa, folio y abono real separados`, () => {
    const rows = construirLibro([{ ...base, sub_qr_id: subId, metadata: { ...base.metadata, ...md } }], "personal");
    assert.equal(rows[0].ambito, amb);
    assert.equal(rows[0].importeReferencia, -100);
    assert.equal(rows[0].monto, 100);
    assert.equal(rows[0].estado, "Completado");
    assert.equal(rows[0].detalle, "Devolución del folio original: QRD-20261107-ABC123");
    assert.equal(statementSummary(estadoDeCuenta(rows, amb, 100, subId), 100).income, 100);
  });
}
test("devolución pagada descuenta cien", () => {
  assert.equal(construirLibro([{ ...base, metadata: { ...base.metadata, refund_received: false } }], null)[0].monto, -100);
});
test("cero y comisiones conciliados sin doble descuento", () => {
  const ledger = construirLibro([{ ...base, tipo: "recarga", monto_mxn: 185, metadata: { monto_transferido: 200, comision_recarga: 15 } }], null);
  assert.deepEqual(statementSummary(estadoDeCuenta(ledger, "eje", 185), 185), { initial: 0, final: 185, income: 200, outgoing: 0, fees: 15, reconciled: true });
});
test("cuenta vacía conserva cero y número enmascarado", () => {
  assert.equal(statementSummary([], 0).initial, 0);
  assert.equal(maskedQard("1234567890124821"), "QaRd •••• 4821");
});
test("diferencia de un centavo falla conciliación", () => {
  const rows = estadoDeCuenta(construirLibro([base], null), "eje", 100);
  rows[0].saldoAntes = 0.01;
  assert.equal(statementSummary(rows, 100).reconciled, false);
});