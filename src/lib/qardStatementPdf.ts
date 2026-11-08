import { jsPDF } from "jspdf";
import { formatHermosillo } from "./utils";
import { money, summaryText, statementSummary, type StatementRows } from "./qardStatement";

export type StatementDocument = { title: string; card: string; period: string; generated: string; rows: StatementRows; summary: ReturnType<typeof statementSummary> };

export function createStatementPdf(data: StatementDocument) {
  const doc = new jsPDF({ format: "letter", orientation: "landscape", unit: "mm" });
  const palette = { ink: [30, 58, 95], muted: [85, 95, 105], line: [218, 224, 230], paper: [248, 249, 250] } as const;
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const left = 12, usable = width - 24;
  let y = 12;
  // Built-in PDF fonts support Latin-1; use ASCII mathematical symbols and masking.
  const printable = (s: string) => s.replace(/−/g, "-").replace(/—/g, "-").replace(/••••/g, "****");
  const line = (s: string, size = 9, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(printable(s), usable);
    doc.text(lines, left, y); y += lines.length * size * 0.4 + 2;
  };
  const head = () => {
    doc.setTextColor(...palette.ink); y = 14;
    line("TodoCerca", 20, true); line(`Estado de cuenta · ${data.title}`, 12, true);
    line(`${data.card}  |  MXN`, 10); line(`Periodo: ${data.period}`, 8);
    line(`Generado: ${formatHermosillo(data.generated)} (Hermosillo)`, 8);
    line(summaryText(data.summary), 9, true); y += 2;
  };
  const cols = [31, 25, 94, 23, 23, usable - 196];
  const labels = ["Folio / fecha", "Estado", "Concepto y comprobante", "Entrada", "Salida / comisión", "Saldo"];
  const tableHead = () => {
    doc.setFillColor(...palette.paper); doc.rect(left, y, usable, 9, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    let x = left;
    labels.forEach((s, i) => { doc.text(doc.splitTextToSize(s, cols[i] - 4), x + 2, y + 3.5); x += cols[i]; });
    y += 10;
  };
  head(); tableHead();
  for (const f of data.rows) {
    const c = f.r.comprobante;
    const details = [f.r.etiqueta, f.r.detalle, c?.contraparte, c?.sucursal ? `Sucursal: ${c.sucursal}` : "", c?.terminal ? `Terminal: ${c.terminal}` : "", c?.metodo,
      f.r.importeReferencia !== undefined ? `Importe de referencia: ${money(f.r.importeReferencia)}` : "",
      c?.comision ? `Comisión informada: ${money(c.comision)}` : ""].filter(Boolean).join("\n");
    const values = [`${f.r.folio ?? ""}\n${formatHermosillo(f.r.created_at)}`, "Completado", details,
      f.monto > 0 ? money(f.monto) : "", f.monto < 0 ? `${f.r.esComision ? "Comisión\n" : ""}${money(-f.monto)}` : "", money(f.saldoDespues)];
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const wrapped = values.map((v, i) => doc.splitTextToSize(printable(v), cols[i] - 4) as string[]);
    const count = Math.max(...wrapped.map(v => v.length));
    // Split long receipts across pages instead of clipping or dropping text.
    let offset = 0;
    while (offset < count) {
      const capacity = Math.floor((height - 18 - y - 4) / 3.6);
      if (capacity < 1) { doc.addPage(); head(); tableHead(); continue; }
      const take = Math.min(capacity, count - offset);
      let x = left;
      doc.setTextColor(...palette.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      wrapped.forEach((ls, i) => { const piece = ls.slice(offset, offset + take); if (piece.length) doc.text(piece, x + 2, y + 4); x += cols[i]; });
      y += take * 3.6 + 4; offset += take;
      doc.setDrawColor(...palette.line); doc.line(left, y, width - left, y); y += 2;
      if (offset < count) { doc.addPage(); head(); tableHead(); }
    }
  }
  if (!data.rows.length) line("Sin movimientos en este periodo.");
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...palette.muted);
    doc.text("Documento generado electrónicamente por TodoCerca. Libro Inmutable.", left, height - 8);
    doc.text(`${p} / ${pages}`, width - left, height - 8, { align: "right" });
  }
  return doc;
}

export function downloadStatementPdf(data: StatementDocument) {
  createStatementPdf(data).save(`TodoCerca-QaRd-${data.generated.slice(0, 10)}.pdf`);
}