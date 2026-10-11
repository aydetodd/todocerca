export function protegerNombreQard(nombre: string): string {
  return nombre.trim().toLocaleUpperCase("es-MX").split(/\s+/).filter(Boolean)
    .map(palabra => Array.from(palabra)[0] + "*****").join(" ");
}

export function rayasNivelQard(nivel: number): number {
  return Math.min(3, Math.max(0, Math.floor(nivel)));
}