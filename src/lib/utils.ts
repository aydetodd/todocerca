import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale: string = 'es-MX'): string {
  const currencyMap: Record<string, string> = {
    'es-MX': 'MXN',
    'en-US': 'USD',
    'es-ES': 'EUR',
    'es-AR': 'ARS',
    'es-CO': 'COP',
  };

  const currency = currencyMap[locale] || 'MXN';
  
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (locale === 'es-MX') {
    return formatted.replace('MX', '').trim() + ' pesos';
  }
  
  if (locale === 'en-US') {
    return formatted.replace('US', '').trim() + ' dollars';
  }

  return formatted;
}

/**
 * Returns today's date string (YYYY-MM-DD) in Hermosillo timezone (UTC-7, no DST).
 * All assignment fecha fields MUST use this to avoid timezone mismatches.
 */
export function getHermosilloToday(): string {
  const now = new Date();
  const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
  return hermosillo.toISOString().split('T')[0];
}

/**
 * Returns the start-of-day ISO string for Hermosillo timezone.
 * Useful for filtering records created today in Hermosillo time.
 */
export function getHermosilloTodayStart(): string {
  return `${getHermosilloToday()}T00:00:00-07:00`;
}

/**
 * Extracts a short route name from a full route name.
 * Removes extra descriptions like "Aeropuerto - San Luis" or "Transportes de Hermosillo".
 * Examples:
 *   "Ruta 1 La Manga, Aeropuerto - San Luis" -> "Ruta 1 La Manga"
 *   "Línea 17 Bachoco, Transportes de Hermosillo" -> "Línea 17 Bachoco"
 */
export function formatShortRouteName(routeName: string | null | undefined): string {
  if (!routeName) return 'Ruta';
  
  // Remove everything after the first comma
  const shortName = routeName.split(',')[0].trim();
  
  return shortName || 'Ruta';
}
