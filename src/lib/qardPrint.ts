import jsPDF from "jspdf";
import QRCode from "qrcode";
import todocercaLogoAsset from "@/assets/todocerca-logo.jpeg.asset.json";

// ISO/IEC 7810 ID-1: 85.60 × 53.98 mm
const CARD_W = 85.6;
const CARD_H = 53.98;
const FOLD_H = CARD_H * 2; // frente + reverso (se dobla a la mitad)


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

// Degradado diagonal (135deg) idéntico al plástico de la app.
function gradientRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const from = [21, 33, 50]; // hsl(215 40% 14%)
  const middle = [36, 53, 76]; // hsl(215 35% 22%)
  const to = [194, 52, 0]; // hsl(16 100% 38%)
  const cols = 90;
  const rows = 40;
  const cw = w / cols;
  const ch = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const t = (i / (cols - 1)) * 0.75 + (j / (rows - 1)) * 0.25;
      const firstHalf = t <= 0.45;
      const localT = firstHalf ? t / 0.45 : (t - 0.45) / 0.55;
      const start = firstHalf ? from : middle;
      const end = firstHalf ? middle : to;
      doc.setFillColor(
        Math.round(start[0] + (end[0] - start[0]) * localT),
        Math.round(start[1] + (end[1] - start[1]) * localT),
        Math.round(start[2] + (end[2] - start[2]) * localT)
      );
      doc.rect(x + i * cw, y + j * ch, cw + 0.12, ch + 0.12, "F");
    }
  }
}


// Devuelve el QR ya girado 180° como PNG dataURL
async function qrDataUrl(value: string, rotated: boolean) {
  const url = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 700,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  if (!rotated) return url;
  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch((todocercaLogoAsset as any).url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  opts: {
    qardNumber: string;
    vencimiento: string;
    alias?: string | null;
    qrFront: string;
    qrBack: string;
    logo: string | null;
  }
) {
  const { qardNumber, vencimiento, alias, qrFront, qrBack, logo } = opts;

  // ================= FRENTE (mitad superior) — idéntico a la app =================
  // La tarjeta en pantalla mide 340 px de ancho: convertimos px -> mm.
  const K = CARD_W / 340;
  const px = (v: number) => v * K;

  gradientRect(doc, x, y, CARD_W, CARD_H);

  // --- Encabezado: logo circular blanco ---
  const logoD = px(44);
  const logoCx = x + px(20) + logoD / 2;
  const logoCy = y + px(20) + logoD / 2;
  doc.setFillColor(255, 255, 255);
  doc.circle(logoCx, logoCy, logoD / 2, "F");
  if (logo) {
    doc.addImage(logo, "JPEG", logoCx - logoD / 2 + px(3), logoCy - logoD / 2 + px(3), logoD - px(6), logoD - px(6));
  }

  // Marca "QaRd" (mayúsculas espaciadas) + subtítulo
  const txtX = x + px(72);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text("Q A R D", txtX, y + px(38));

  doc.setFontSize(6.6);
  doc.setTextColor(190, 197, 208);
  doc.text("Tarjeta principal · 00", txtX, y + px(52));

  // --- QR pequeño arriba a la derecha (caja blanca con padding) ---
  const qrBox = px(66);
  const qrImg = px(54);
  const qrBoxX = x + px(340 - 20 - 66);
  const qrBoxY = y + px(20);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrBoxX, qrBoxY, qrBox, qrBox, px(6), px(6), "F");
  doc.addImage(qrFront, "PNG", qrBoxX + px(6), qrBoxY + px(6), qrImg, qrImg);

  // --- Chip dorado (44x32 px) ---
  const chipX = x + px(20);
  const chipY = y + px(76);
  const chipW = px(44);
  const chipH = px(32);
  doc.setFillColor(224, 187, 82);
  doc.roundedRect(chipX, chipY, chipW, chipH, px(6), px(6), "F");
  doc.setDrawColor(150, 118, 30);
  doc.setLineWidth(0.15);
  doc.line(chipX, chipY + chipH / 2, chipX + chipW, chipY + chipH / 2);
  doc.line(chipX + chipW / 2, chipY, chipX + chipW / 2, chipY + chipH);

  // --- Contactless (3 arcos) centrado con el chip ---
  const clX = x + px(76);
  const clCy = chipY + chipH / 2;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  [0, 1, 2].forEach((i) => {
    const lx = clX + px(4 + i * 5);
    const half = px(5 + i * 4);
    doc.line(lx, clCy - half, lx, clCy + half);
  });

  // --- Icono de impresión (a la derecha, alineado con el chip) ---
  const prX = x + px(340 - 20 - 19 - 16);
  const prY = chipY + px(3);
  const prW = px(16);
  doc.setDrawColor(235, 238, 242);
  doc.setFillColor(235, 238, 242);
  doc.setLineWidth(0.22);
  // bandeja superior
  doc.rect(prX + prW * 0.22, prY, prW * 0.56, prW * 0.22, "S");
  // cuerpo
  doc.rect(prX, prY + prW * 0.24, prW, prW * 0.42, "S");
  // hoja saliente
  doc.rect(prX + prW * 0.22, prY + prW * 0.6, prW * 0.56, prW * 0.34, "S");

  // --- Número 16 dígitos (mono, justificado como en pantalla) ---
  doc.setFont("courier", "normal");
  doc.setFontSize(13.6);
  doc.setTextColor(255, 255, 255);
  const grupos = formatNumero(qardNumber).split(" ");
  const numY = y + px(139);
  const leftX = x + px(20);
  const rightX = x + px(320);
  const gW = doc.getTextWidth(grupos[0]);
  const span = rightX - leftX - gW;
  grupos.forEach((g, i) => {
    doc.text(g, leftX + (span * i) / 3, numY);
  });

  // --- Pie: TITULAR / VENCE / CVV ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.4);
  doc.setTextColor(175, 183, 196);
  const labelY = y + px(163);
  const valueY = y + px(179);
  doc.text("TITULAR", leftX, labelY);
  doc.text("VENCE", x + CARD_W / 2, labelY, { align: "center" });
  doc.text("CVV", rightX, labelY, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.setTextColor(255, 255, 255);
  doc.text((alias || "TITULAR QARD").toString().toUpperCase().slice(0, 18), leftX, valueY);
  doc.setFont("courier", "bold");
  doc.text(vencimiento || "12/99", x + CARD_W / 2, valueY, { align: "center" });
  doc.text("• • •", rightX, valueY, { align: "right" });



  // ================= REVERSO (mitad inferior) — solo QR grande de cabeza =================
  const backTop = y + CARD_H;
  doc.setFillColor(255, 255, 255);
  doc.rect(x, backTop, CARD_W, CARD_H, "F");

  const qrSize = 42;
  doc.addImage(
    qrBack,
    "PNG",
    x + (CARD_W - qrSize) / 2,
    backTop + (CARD_H - qrSize) / 2,
    qrSize,
    qrSize
  );

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

  const qrFront = await qrDataUrl(qardNumber, false);
  const qrBack = await qrDataUrl(qardNumber, true);
  const logo = await loadLogo();


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
      await drawCard(doc, x, y, { qardNumber, vencimiento, alias, qrFront, qrBack, logo });
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

  const filename = `QaRd-${qardNumber || "tarjetas"}.pdf`;
  const blob = doc.output("blob");

  // 1) Móvil (iOS/Android): compartir/guardar el archivo con la hoja nativa
  try {
    const nav: any = navigator;
    const file = new File([blob], filename, { type: "application/pdf" });
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // si el usuario cancela o falla, seguimos con la descarga normal
  }

  // 2) Escritorio: descarga directa
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, "_blank");
  }

  // 3) Fallback: abrir en pestaña nueva si el navegador bloquea la descarga
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
