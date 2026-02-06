/**
 * Utility to format unit (unidad) display consistently across the app.
 * Shows: Descripción · Placas · No. Económico
 */

interface UnitDisplayInfo {
  nombre: string;        // No. Económico
  placas?: string | null;
  descripcion?: string | null;
}

/**
 * Full label for a unit, e.g. "Mercedes-Benz · Placas: ABC-1234 · No. Eco: 15"
 */
export function formatUnitLabel(unit: UnitDisplayInfo): string {
  const parts: string[] = [];

  if (unit.descripcion) parts.push(unit.descripcion);
  if (unit.placas) parts.push(`Placas: ${unit.placas}`);
  parts.push(`No. Eco: ${unit.nombre}`);

  return parts.join(' · ');
}

/**
 * Short label for selectors: "🚌 Mercedes-Benz · ABC-1234 · ECO-15"
 */
export function formatUnitOption(unit: UnitDisplayInfo): string {
  const parts: string[] = [unit.nombre];
  if (unit.placas) parts.push(`Placas: ${unit.placas}`);
  if (unit.descripcion) parts.push(unit.descripcion);
  return parts.join(' · ');
}
