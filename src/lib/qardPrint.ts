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

// Degradado horizontal (azul oscuro → naranja) simulado con franjas finas
function gradientRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const from = [13, 23, 38];
  const to = [199, 74, 16];
  const steps = 120;
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    doc.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t)
    );
    doc.rect(x + i * sw, y, sw + 0.15, h, "F");
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
  gradientRect(doc, x, y, CARD_W, CARD_H);

  // Logo circular blanco
  const logoD = 11;
  const logoX = x + 6;
  const logoY = y + 5;
  doc.setFillColor(255, 255, 255);
  doc.circle(logoX + logoD / 2, logoY + logoD / 2, logoD / 2, "F");
  if (logo) {
    doc.addImage(logo, "JPEG", logoX + 0.9, logoY + 0.9, logoD - 1.8, logoD - 1.8);
  }

  // Marca "Q A R D" + subtítulo
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Q A R D", logoX + logoD + 3.5, y + 9.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(200, 208, 220);
  doc.text(alias ? String(alias) : "Tarjeta principal · 00", logoX + logoD + 3.5, y + 13.5);

  // QR pequeño arriba a la derecha (como en el teléfono)
  const miniQr = 15;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + CARD_W - miniQr - 7.4, y + 3.6, miniQr + 2.8, miniQr + 2.8, 1, 1, "F");
  doc.addImage(qrFront, "PNG", x + CARD_W - miniQr - 6, y + 5, miniQr, miniQr);

  // Chip dorado
  doc.setFillColor(212, 175, 55);
  doc.roundedRect(x + 6, y + 20, 11, 8.5, 1.4, 1.4, "F");
  doc.setDrawColor(160, 128, 30);
  doc.setLineWidth(0.2);
  doc.line(x + 6, y + 24.2, x + 17, y + 24.2);
  doc.line(x + 11.5, y + 20, x + 11.5, y + 28.5);

  // Contactless (arcos simulados)
  doc.setDrawColor(255, 255, 255);
  for (let i = 1; i <= 3; i++) {
    doc.setLineWidth(0.35);
    doc.circle(x + 20.5, y + 24.2, i * 1.5);
  }

  // Número 16 dígitos
  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(formatNumero(qardNumber), x + CARD_W / 2, y + 38, { align: "center" });

  // Pie: TITULAR / VENCE / CVV
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(200, 206, 216);
  doc.text("TITULAR", x + 6, y + 45);
  doc.text("VENCE", x + CARD_W / 2, y + 45, { align: "center" });
  doc.text("CVV", x + CARD_W - 6, y + 45, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text((alias || "TITULAR QARD").toString().toUpperCase().slice(0, 18), x + 6, y + 49.5);
  doc.setFont("courier", "bold");
  doc.text(vencimiento || "12/99", x + CARD_W / 2, y + 49.5, { align: "center" });
  doc.text("• • •", x + CARD_W - 6, y + 49.5, { align: "right" });


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
