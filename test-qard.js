import { jsPDF } from "jspdf";
import QRCode from "qrcode";

const CARD_W = 85.6;
const CARD_H = 53.98;
const FOLD_H = CARD_H * 2;

function formatNumero(n) {
  const d = (n || "").replace(/\D/g, "").padEnd(16, "0").slice(0, 16);
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
}

function dashedLine(doc, x1, y1, x2, y2, dash = 1.2, gap = 1.2) {
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

async function drawCard(doc, x, y, opts) {
  const { qardNumber, vencimiento } = opts;

  doc.setDrawColor(150);
  doc.setLineWidth(0.15);
  dashedLine(doc, x, y, x + CARD_W, y);
  dashedLine(doc, x + CARD_W, y, x + CARD_W, y + FOLD_H);
  dashedLine(doc, x + CARD_W, y + FOLD_H, x, y + FOLD_H);
  dashedLine(doc, x, y + FOLD_H, x, y);

  doc.setDrawColor(90);
  dashedLine(doc, x, y + CARD_H, x + CARD_W, y + CARD_H, 2.5, 1.5);

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

  doc.setTextColor(0);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(formatNumero(qardNumber), x + CARD_W / 2, qrY + qrSizeMm + 5, {
    align: "center",
  });

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

  const backCenterX = x + CARD_W / 2;
  const backTop = y + CARD_H;
  const backBottom = y + FOLD_H;
  const backMidY = (backTop + backBottom) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(20);
  doc.text("QaRd", backCenterX, backMidY + 4.5, {
    align: "center",
    angle: 180,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(60);
  doc.text("Saldo Digital", backCenterX, backMidY - 3.5, {
    align: "center",
    angle: 180,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("todocerca.mx", backCenterX, backMidY - 6.5, {
    align: "center",
    angle: 180,
  });
}

async function main() {
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(
    "Tarjetas QaRd · Juan · recortar, doblar y enmicar",
    pageW / 2,
    originY - 6,
    { align: "center" }
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * (CARD_W + gapX);
      const y = originY + r * (FOLD_H + gapY);
      await drawCard(doc, x, y, { qardNumber: "5226030000000104", vencimiento: "12/99" });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Imprime en papel blanco tamaño carta/A4 al 100% (sin ajuste). Recorta por el borde punteado y dobla por la línea central.",
    pageW / 2,
    pageH - 10,
    { align: "center" }
  );

  doc.save("test.pdf");
}

main().catch(console.error);
