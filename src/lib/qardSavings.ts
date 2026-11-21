export const POCKET_CONCEPTS: readonly string[] = ['Renta', 'Útiles', 'Vacaciones', 'Emergencias', 'Salud', 'Otro'];

/** Historic rows remain intact; a concept is shown only once. */
export function uniquePocketConcepts(rows: ReadonlyArray<{ concepto: string }>): string[] {
  return [...new Set(rows.map(row => row.concepto))];
}