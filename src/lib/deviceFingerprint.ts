// Generación y persistencia de un fingerprint de dispositivo en localStorage
// No es un identificador del hardware (no posible en navegador), pero sí del navegador/instalación.

const FP_KEY = "tc_device_fingerprint_v1";
const FP_NAME_KEY = "tc_device_name_v1";

export type DeviceType = "mobile" | "desktop" | "tablet";

export function getDeviceType(): DeviceType {
  const ua = navigator.userAgent || "";
  const isTablet = /iPad|Tablet|Nexus 7|Nexus 10/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (isTablet) return "tablet";
  const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobile ? "mobile" : "desktop";
}

export function getDeviceName(): string {
  const cached = localStorage.getItem(FP_NAME_KEY);
  if (cached) return cached;

  const ua = navigator.userAgent || "";
  let name = "Dispositivo";
  if (/iPhone/i.test(ua)) name = "iPhone";
  else if (/iPad/i.test(ua)) name = "iPad";
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android.*?;\s*([^;)]+?)(?:\s+Build|\))/);
    name = m ? m[1].trim() : "Android";
  } else if (/Macintosh/i.test(ua)) name = "Mac";
  else if (/Windows/i.test(ua)) name = "Windows PC";
  else if (/Linux/i.test(ua)) name = "Linux PC";

  localStorage.setItem(FP_NAME_KEY, name);
  return name;
}

export function getDeviceFingerprint(): string {
  const cached = localStorage.getItem(FP_KEY);
  if (cached && cached.length >= 16) return cached;

  // Genera un UUID persistente vinculado a este navegador/instalación
  const rand = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const fp = `${rand}-${(navigator.platform || "p").replace(/\s/g, "")}`.slice(0, 64);
  localStorage.setItem(FP_KEY, fp);
  return fp;
}
