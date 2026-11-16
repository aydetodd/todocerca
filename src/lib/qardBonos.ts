// Terminaciones QaRd: los dos últimos dígitos definen el tipo de cuenta.
export type BonoCat = "alimentos" | "despensa" | "gasolina" | "farmacia" | "papeleria";
export type Giro = "comida" | "gasolinera" | "farmacia" | "papeleria" | "otro";

export const BONOS: { cat: BonoCat; indice: number; nombre: string; emoji: string }[] = [
  { cat: "alimentos", indice: 2, nombre: "Bono Alimentos", emoji: "🍽️" },
  { cat: "despensa", indice: 3, nombre: "Despensa Digital", emoji: "🛒" },
  { cat: "gasolina", indice: 4, nombre: "Bono Gasolina", emoji: "⛽" },
  { cat: "farmacia", indice: 5, nombre: "Bono Farmacia", emoji: "💊" },
  { cat: "papeleria", indice: 6, nombre: "Bono Papelería", emoji: "✏️" },
];

export const GIROS: { giro: Giro; nombre: string }[] = [
  { giro: "comida", nombre: "Comida / restaurante / abarrotes" },
  { giro: "gasolinera", nombre: "Gasolinera" },
  { giro: "farmacia", nombre: "Farmacia" },
  { giro: "papeleria", nombre: "Papelería" },
  { giro: "otro", nombre: "Otro giro" },
];

export const PRIMERA_FAMILIAR = 11;

export function tipoPorTerminacion(n: number): "eje" | "empresarial" | "bono" | "reservada" | "familiar" {
  if (n === 0) return "eje";
  if (n === 1) return "empresarial";
  if (n >= 2 && n <= 6) return "bono";
  if (n >= 7 && n <= 10) return "reservada";
  return "familiar";
}

export const bonoPorIndice = (n: number) => BONOS.find(b => b.indice === n);
export const bonoPorCat = (c: string) => BONOS.find(b => b.cat === c);

/** Mismo criterio que el servidor (qard_giro_bonos). */
export function bonosDelGiro(g: Giro | string | null | undefined): BonoCat[] {
  switch (g) {
    case "comida": return ["alimentos", "despensa"];
    case "gasolinera": return ["gasolina"];
    case "farmacia": return ["farmacia"];
    case "papeleria": return ["papeleria"];
    default: return [];
  }
}

/** Un bono solo viaja a una tarjeta del mismo bono; el saldo general nunca entra a un bono. */
export function transferenciaPermitida(origen: number, destino: number): boolean {
  const o = tipoPorTerminacion(origen) === "bono", d = tipoPorTerminacion(destino) === "bono";
  if (!o && !d) return true;
  return origen === destino;
}

export function siguienteFamiliar(usados: number[]): number | null {
  for (let i = PRIMERA_FAMILIAR; i < 100; i++) if (!usados.includes(i)) return i;
  return null;
}
