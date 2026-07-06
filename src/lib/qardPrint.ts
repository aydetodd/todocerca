import jsPDF from "jspdf";
import QRCode from "qrcode";

// ISO/IEC 7810 ID-1: 85.60 × 53.98 mm
const CARD_W = 85.6;
const CARD_H = 53.98;
const FOLD_H = CARD_H * 2; // doble altura para doblar (frente + reverso)

function formatNumero(n: string) {
  const d = (n || "").replace(/\D/g, "").padEnd(16, "0").slice(0, 16);
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
}

// Línea punteada manual (setLineDashPattern es inconsistente entre versiones de jsPDF)
function dashedLine(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash = 1.2,
  gap = 1.2
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
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
  opts: { qardNumber: string; vencimiento: string; alias?: string | null }
) {
  const { qardNumber, vencimiento, alias } = opts;

  // ============ Bordes: cortar (punteado fino) ============
  doc.setDrawColor(150);
  doc.setLineWidth(0.15);
  dashedLine(doc, x, y, x + CARD_W, y);
  dashedLine(doc, x + CARD_W, y, x + CARD_W, y + FOLD_H);
  dashedLine(doc, x + CARD_W, y + FOLD_H, x, y + FOLD_H);
  dashedLine(doc, x, y + FOLD_H, x, y);

  // ============ Doblez (a la mitad) ============
  doc.setDrawColor(90);
  dashedLine(doc, x, y + CARD_H, x + CARD_W, y + CARD_H, 2.5, 1.5);

  // ================= FRENTE (mitad superior) =================
  // QR grande centrado, número debajo, vigencia debajo
  const qrSizeMm = 32;
  const qrX = x + (CARD_W - qrSizeMm) / 2;
  const qrY = y + 3.5;

  const qrDataUrl = await QRCode.toDataURL(qardNumber, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSizeMm, qrSizeMm);

  // Número 16 dígitos
  doc.setTextColor(0);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(formatNumero(qardNumber), x + CARD_W / 2, qrY + qrSizeMm + 5, {
    align: "center",
  });

  // Vigencia
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text("VIGENCIA", x + CARD_W / 2, qrY + qrSizeMm + 9.5, { align: "center" });
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(vencimiento || "12/99", x + CARD_W / 2, qrY + qrSizeMm + 13.5, {
    align: "center",
  });

  // ================= REVERSO (mitad inferior, IMPRESO DE CABEZA) =================
  // Al doblar hacia atrás, el texto rotado 180° queda derecho y centrado.
  // Coordenadas físicas del reverso: y + CARD_H .. y + FOLD_H
  // Con angle:180, el punto (bx, by) corresponde visualmente a la esquina
  // opuesta cuando ya está doblado. Para centrar verticalmente en la mitad
  // inferior, usamos el centro físico de esa mitad.
  const backCenterX = x + CARD_W / 2;
  const backTop = y + CARD_H;         // borde físico superior del reverso (= pliegue)
  const backBottom = y + FOLD_H;      // borde físico inferior del reverso
  const backMidY = (backTop + backBottom) / 2;

  // Con angle 180, "hacia abajo" en Y se percibe "hacia arriba" al doblar.
  // Colocamos las 3 líneas centradas respecto a backMidY.
  // Orden visual (ya doblado, de arriba a abajo): QaRd → Saldo Digital → todocerca.mx
  // Como está rotado 180°, en Y físico el orden se invierte:
  //   físicamente arriba (backMidY - offset) = visualmente abajo
  //   físicamente abajo  (backMidY + offset) = visualmente arriba

  // QaRd (grande) — visualmente arriba → físicamente abajo del centro
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(20);
  doc.text("QaRd", backCenterX, backMidY + 4.5, {
    align: "center",
    angle: 180,
  });

  // Saldo Digital (mediano) — visualmente medio
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(60);
  doc.text("Saldo Digital", backCenterX, backMidY - 3.5, {
    align: "center",
    angle: 180,
  });

  // todocerca.mx (chico) — visualmente abajo → físicamente arriba del centro
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("todocerca.mx", backCenterX, backMidY - 6.5, {
    align: "center",
    angle: 180,
  });

}

export async function generarPdfTarjetasQard(
  qardNumber: string,
  vencimiento = "12/99",
  alias?: string | null
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;

  const cols = 2;
  const rows = 2;
  const gapX = 8;
  const gapY = 10;
  const totalW = cols * CARD_W + (cols - 1) * gapX;
  const totalH = rows * FOLD_H + (rows - 1) * gapY;
  const originX = (pageW - totalW) / 2;
  const originY = (pageH - totalH) / 2;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(
    `Tarjetas QaRd${alias ? " · " + alias : ""} · recortar, doblar y enmicar`,
    pageW / 2,
    originY - 6,
    { align: "center" }
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * (CARD_W + gapX);
      const y = originY + r * (FOLD_H + gapY);
      await drawCard(doc, x, y, { qardNumber, vencimiento, alias });
    }
  }

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Imprime en papel blanco tamaño carta/A4 al 100% (sin ajuste). Recorta por el borde punteado y dobla por la línea central.",
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
