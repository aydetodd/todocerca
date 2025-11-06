import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Currency formatting utility

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
