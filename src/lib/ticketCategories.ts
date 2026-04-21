// Configuración centralizada de categorías de boletos QR
// Los precios son provisionales y se ajustarán con los concesionarios

export type TicketCategory =
  | "normal"
  | "estudiante"
  | "tercera_edad"
  | "nino_menor_5"
  | "nino_5_10"
  | "discapacitado"
  | "embarazada"
  | "ceguera_total";

export interface TicketCategoryConfig {
  key: TicketCategory;
  label: string;
  labelCorto: string;
  precio: number; // en pesos MXN
  icon: string; // emoji
  requiereVerificacion: boolean;
  descripcionCredencial: string;
  esGratis: boolean;
}

export const TICKET_CATEGORIES: TicketCategoryConfig[] = [
  {
    key: "normal",
    label: "Ordinario",
    labelCorto: "Ordinario",
    precio: 9.0,
    icon: "🎫",
    requiereVerificacion: false,
    descripcionCredencial: "",
    esGratis: false,
  },
  {
    key: "estudiante",
    label: "Estudiante",
    labelCorto: "Estudiante",
    precio: 5.0,
    icon: "🎓",
    requiereVerificacion: true,
    descripcionCredencial: "Credencial de estudiante vigente",
    esGratis: false,
  },
  {
    key: "tercera_edad",
    label: "Tercera Edad (60+)",
    labelCorto: "Tercera Edad",
    precio: 5.0,
    icon: "👴",
    requiereVerificacion: true,
    descripcionCredencial: "INE que acredite 60+ años",
    esGratis: false,
  },
  {
    key: "nino_menor_5",
    label: "Niño menor de 5 años",
    labelCorto: "Niño <5",
    precio: 0,
    icon: "👶",
    requiereVerificacion: true,
    descripcionCredencial: "Acta de nacimiento o CURP del menor",
    esGratis: true,
  },
  {
    key: "nino_5_10",
    label: "Niño de 5 a 10 años",
    labelCorto: "Niño 5-10",
    precio: 5.0,
    icon: "🧒",
    requiereVerificacion: true,
    descripcionCredencial: "Acta de nacimiento o CURP del menor",
    esGratis: false,
  },
  {
    key: "discapacitado",
    label: "Discapacidad",
    labelCorto: "Discapacidad",
    precio: 5.0,
    icon: "♿",
    requiereVerificacion: true,
    descripcionCredencial: "Credencial de discapacidad vigente",
    esGratis: false,
  },
  {
    key: "embarazada",
    label: "Embarazada",
    labelCorto: "Embarazada",
    precio: 5.0,
    icon: "🤰",
    requiereVerificacion: true,
    descripcionCredencial: "Constancia médica de embarazo",
    esGratis: false,
  },
  {
    key: "ceguera_total",
    label: "Ceguera Total",
    labelCorto: "Ceguera Total",
    precio: 0,
    icon: "🦯",
    requiereVerificacion: true,
    descripcionCredencial: "Credencial de discapacidad visual",
    esGratis: true,
  },
];

export const TICKET_PRICE_MAP: Record<TicketCategory, number> = Object.fromEntries(
  TICKET_CATEGORIES.map((c) => [c.key, c.precio])
) as Record<TicketCategory, number>;

export function getCategoryConfig(key: string): TicketCategoryConfig | undefined {
  return TICKET_CATEGORIES.find((c) => c.key === key);
}

export function getCategoryLabel(key: string): string {
  return getCategoryConfig(key)?.label || "Ordinario";
}

export function getCategoryPrice(key: string): number {
  return TICKET_PRICE_MAP[key as TicketCategory] ?? 9.0;
}

export function getDiscountCategories(): TicketCategoryConfig[] {
  return TICKET_CATEGORIES.filter((c) => c.requiereVerificacion);
}
