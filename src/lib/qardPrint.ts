import jsPDF from "jspdf";
import QRCode from "qrcode";

// ISO/IEC 7810 ID-1: 85.60 × 53.98 mm
const CARD_W = 85.6;
const CARD_H = 53.98;
const FOLD_H = CARD_H * 2; // doble altura para doblar

function formatNumero(n: string) {
  const d = (n || "").replace(/\D/g, "").padEnd(16, "0").slice(0, 16);
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
}

// Línea punteada manual (jsPDF setLineDashPattern es inconsistente entre versiones)
function dashedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, dash = 1.2, gap = 1.2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  let d = 0;
  while (d < len) {
    const e = Math.min(d + dash, len);
    doc.line(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
    d = e + gap;
  }
}

async function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  opts: { qardNumber: string; vencimiento: string }
) {
  const { qardNumber, vencimiento } = opts;

  // Borde exterior punteado (cortar)
  doc.setDrawColor(140);
  doc.setLineWidth(0.15);
  dashedLine(doc, x, y, x + CARD_W, y);
  dashedLine(doc, x + CARD_W, y, x + CARD_W, y + FOLD_H);
  dashedLine(doc, x + CARD_W, y + FOLD_H, x, y + FOLD_H);
  dashedLine(doc, x, y + FOLD_H, x, y);

  // Línea de doblez (mitad) — trazos más largos
  doc.setDrawColor(90);
  dashedLine(doc, x, y + CARD_H, x + CARD_W, y + CARD_H, 2.5, 1.5);

  // ================= FRENTE (mitad superior) =================
  const qrSizeMm = 34;
  const qrX = x + (CARD_W - qrSizeMm) / 2;
  const qrY = y + 3;

  const qrDataUrl = await QRCode.toDataURL(qardNumber, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSizeMm, qrSizeMm);

  // Número
  doc.setTextColor(0);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(formatNumero(qardNumber), x + CARD_W / 2, qrY + qrSizeMm + 5, { align: "center" });

  // Vigencia
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("VIGENCIA", x + CARD_W / 2, qrY + qrSizeMm + 9.5, { align: "center" });
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(vencimiento || "12/99", x + CARD_W / 2, qrY + qrSizeMm + 14, { align: "center" });

  // ================= REVERSO (mitad inferior, DE CABEZA) =================
  // Se rotan los textos 180° alrededor de su punto, ubicándolos en la mitad inferior.
  // Con jsPDF: text(..., { angle: 180 }) rota alrededor de (x,y).
  const backCenterX = x + CARD_W / 2;
  const backTopY = y + CARD_H; // inicio del reverso

  // "todocerca" grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(20);
  // Ubicado cerca del "fondo" del reverso (que al doblar queda arriba)
  doc.text("todocerca", backCenterX, backTopY + CARD_H - 32, { align: "center", angle: 180 });

  // "QaRd · Saldo Digital"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text("QaRd  ·  Saldo Digital", backCenterX, backTopY + CARD_H - 22, {
    align: "center",
    angle: 180,
  });

  // Marca discreta
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("todocerca.mx", backCenterX, backTopY + CARD_H - 10, { align: "center", angle: 180 });
}

export async function generarPdfTarjetasQard(qardNumber: string, vencimiento = "12/99") {
  // A4 vertical
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;

  const cols = 2;
  const rows = 2;
  const gapX = 6;
  const gapY = 8;
  const totalW = cols * CARD_W + (cols - 1) * gapX;
  const totalH = rows * FOLD_H + (rows - 1) * gapY;
  const originX = (pageW - totalW) / 2;
  const originY = (pageH - totalH) / 2;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text("Tarjetas QaRd · recortar, doblar y enmicar", pageW / 2, originY - 6, {
    align: "center",
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * (CARD_W + gapX);
      const y = originY + r * (FOLD_H + gapY);
      await drawCard(doc, x, y, { qardNumber, vencimiento });
    }
  }

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Imprime en papel blanco tamaño carta/A4 al 100%. Corta por el borde punteado y dobla por la línea central.",
    pageW / 2,
    pageH - 10,
    { align: "center" }
  );

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `QaRd-${qardNumber || "tarjetas"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
