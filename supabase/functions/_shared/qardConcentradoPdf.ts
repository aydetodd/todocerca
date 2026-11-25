import { concentratedStatement, money, printDate, type DocumentSource } from './qardConcentrado.ts';

// Centralized print palette; the PDF is intentionally independent of the screen theme.
export const printPalette = { blue: [0, 86, 179], ink: [34, 34, 34], muted: [90, 98, 108], paper: [244, 247, 250], line: [220, 225, 230], green: [26, 127, 55], red: [192, 57, 43], white: [255, 255, 255] } as const;
type Canvas = {
  setTextColor(r: number, g: number, b: number): unknown; setDrawColor(r: number, g: number, b: number): unknown;
  setFillColor(r: number, g: number, b: number): unknown; setFont(font: string, style: string): unknown; setFontSize(size: number): unknown;
  text(text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): unknown;
  rect(x: number, y: number, width: number, height: number, style?: string): unknown; line(x1: number, y1: number, x2: number, y2: number): unknown;
  splitTextToSize(text: string, width: number): string[]; addImage(image: string, format: string, x: number, y: number, width: number, height: number): unknown;
};
export function renderConcentratedPdf(doc: Canvas, source: DocumentSource, sourceHash: string, qr: string) {
  const statement = concentratedStatement(source);
  if (!statement.reconciled) throw new Error('El documento no concilia; vuelve a consultar.');
  if (statement.rows.length > 36) throw new Error('Este periodo supera una página. Elige 7 o 15 días; el reporte detallado conserva todos los movimientos.');
  const p = printPalette;
  const text = (s: string | string[], x: number, y: number, size = 9, bold = false, color: readonly [number, number, number] = p.ink, align: 'left' | 'center' | 'right' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(s, x, y, { align });
  };
  text('TODOCERCA', 15, 23, 20, true, p.blue);
  text('Estado de Cuenta QaRd', 195, 21, 14, true, p.ink, 'right');
  text(source.address?.status === 'valid' ? 'Comprobante Digital Oficial · Presencia reforzada' : 'Comprobante Digital · Domicilio pendiente', 195, 28, 8, false, p.muted, 'right');
  doc.setDrawColor(...p.blue); doc.line(15, 33, 195, 33);
  let y = 42;
  const field = (label: string, value: string) => {
    text(label, 15, y, 9, true);
    const lines = doc.splitTextToSize(value, 153);
    if (lines.length > 3) throw new Error('El domicilio es demasiado largo para una página.');
    text(lines, 42, y); y += Math.max(1, lines.length) * 4.5 + 2;
  };
  field('Titular:', source.name.toLocaleUpperCase('es-MX') || 'Nombre legal pendiente');
  const a = source.address;
  field('Dirección:', a ? `${a.calle} ${a.numero}, ${a.colonia}, CP ${a.cp}, ${a.municipio}, ${a.estado}${a.status !== 'valid' ? ' (declarada, sin verificar)' : ''}` : 'Sin domicilio registrado');
  field('Tarjeta:', source.qard.replace(/(\d{4})(?=\d)/g, '$1 '));
  text(`Periodo: ${printDate(source.start)} - ${printDate(source.end)}`, 15, y, 8);
  text(`Emisión: ${printDate(source.end)} · Hermosillo`, 195, y, 8, false, p.muted, 'right');
  y += 7;
  doc.setFillColor(...p.paper); doc.rect(15, y, 180, 21, 'F'); doc.setFillColor(...p.blue); doc.rect(15, y, 1.3, 21, 'F');
  [['Saldo Inicial', statement.initial, p.ink], ['Entradas', statement.income, p.green], ['Salidas', statement.outgoing, p.red], ['Saldo Final', statement.final, p.ink]].forEach(([label, value, color], i) => {
    text(String(label), 39 + 44 * i, y + 7, 8, false, p.muted, 'center');
    text(money(Number(value)), 39 + 44 * i, y + 15, 11, true, color as readonly [number, number, number], 'center');
  });
  y += 29;
  const widths = [29, 31, 31, 29, 29, 31], positions = [15, 44, 75, 106, 135, 164];
  doc.setFillColor(...p.blue); doc.rect(15, y, 180, 8, 'F');
  ['Fecha', 'Concepto', 'Referencia', 'Entradas', 'Salidas', 'Saldo'].forEach((s, i) => text(s, i < 3 ? positions[i] + 2 : positions[i] + widths[i] - 2, y + 5.3, 8, true, p.white, i < 3 ? 'left' : 'right'));
  y += 8;
  const rowHeight = Math.min(7, (247 - y) / statement.rows.length);
  if (rowHeight < 3.7) throw new Error('El documento supera una página. Elige un periodo más corto.');
  const size = rowHeight < 5 ? 6.7 : 8;
  statement.rows.forEach((r, i) => {
    if (i % 2 === 0) { doc.setFillColor(...p.paper); doc.rect(15, y, 180, rowHeight, 'F'); }
    const values = [printDate(r.date), r.concept, r.reference || '-', r.income ? money(r.income) : '-', r.outgoing ? `-${money(r.outgoing)}` : '-', money(r.balance)];
    values.forEach((v, j) => text(v, j < 3 ? positions[j] + 2 : positions[j] + widths[j] - 2, y + rowHeight * .67, size, j >= 3, j === 3 ? p.green : j === 4 ? p.red : p.ink, j < 3 ? 'left' : 'right'));
    y += rowHeight;
  });
  doc.setDrawColor(...p.line); doc.line(15, 254, 195, 254);
  doc.setFont('courier', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...p.ink);
  const sealLines = sourceHash.match(/.{1,78}/g) ?? [sourceHash];
  doc.text(sealLines, 15, 262);
  doc.setDrawColor(...p.line); doc.rect(168, 256, 27, 27);
  doc.addImage(qr, 'PNG', 169, 257, 25, 25);
  text('Escanear para verificar', 181.5, 287, 6.5, false, p.muted, 'center');
  return statement;
}