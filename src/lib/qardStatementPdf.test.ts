import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createStatementPdf } from "./qardStatementPdf";
import { statementSummary } from "./qardStatement";
import { construirLibro, estadoDeCuenta } from "./qardEtiquetas";

test("PDF conserva movimientos completos en múltiples páginas", () => {
  const rows = estadoDeCuenta(construirLibro(Array.from({ length: 90 }, (_, i) => ({ id: `movement-${i}`, tipo: "devolucion", monto_mxn: -1, descripcion: null, sub_qr_id: null, created_at: "2026-11-08T13:31:00Z", metadata: { original_folio: `QRD-20261107-${String(i).padStart(6, "0")}`, refund_received: true } })), null), "eje", 90);
  const doc = createStatementPdf({ title: "Personal", card: "QaRd •••• 4821", period: "8 noviembre 2026", generated: "2026-11-08T13:31:00Z", rows, summary: statementSummary(rows, 90) });
  const pdf = doc.output();
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(pdf.includes("QRD-20261107-000089"));
  assert.ok(pdf.includes("QRD-20261107-000000"));
});