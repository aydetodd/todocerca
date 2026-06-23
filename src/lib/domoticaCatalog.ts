// Catálogo fijo de dispositivos posibles en una casa.
// is_installed se simula localmente en Fase 1 (UI). Después vendrá de Supabase.

import {
  Lightbulb,
  Lamp,
  Snowflake,
  Fan,
  Thermometer,
  Blinds,
  DoorOpen,
  Lock,
  Camera,
  Bell,
  Siren,
  Droplets,
  Sprout,
  Tv,
  Speaker,
  Plug,
  Microwave,
  WashingMachine,
  Refrigerator,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type DomoticaCategoryId =
  | "iluminacion"
  | "clima"
  | "cortinas"
  | "seguridad"
  | "riego"
  | "otros";

export interface DomoticaCategory {
  id: DomoticaCategoryId;
  label: string;
  icon: LucideIcon;
  /** Color base del ícono cuando está activo (hsl token o tailwind class). */
  colorClass: string;
  /** Fondo suave para la tarjeta de categoría. */
  bgClass: string;
}

export interface DomoticaDevice {
  id: string;
  category: DomoticaCategoryId;
  name: string;
  icon: LucideIcon;
  /** Tipo de control que abre el drawer. */
  control: "toggle" | "dimmer" | "thermostat" | "blinds" | "camera";
  /** Si está instalado físicamente en casa. (Fase 1: simulado local) */
  is_installed: boolean;
  /** Estado encendido/apagado. */
  is_on?: boolean;
  /** Valor 0-100 para dimmers / cortinas. */
  value?: number;
  /** Temperatura objetivo °C para clima. */
  temp?: number;
}

export const CATEGORIES: DomoticaCategory[] = [
  { id: "iluminacion", label: "Iluminación", icon: Lightbulb, colorClass: "text-amber-400", bgClass: "bg-amber-500/10" },
  { id: "clima",       label: "Clima",       icon: Snowflake, colorClass: "text-sky-400",   bgClass: "bg-sky-500/10" },
  { id: "cortinas",    label: "Cortinas",    icon: Blinds,    colorClass: "text-violet-400",bgClass: "bg-violet-500/10" },
  { id: "seguridad",   label: "Seguridad",   icon: Lock,      colorClass: "text-rose-400",  bgClass: "bg-rose-500/10" },
  { id: "riego",       label: "Riego",       icon: Sprout,    colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10" },
  { id: "otros",       label: "Otros",       icon: Plug,      colorClass: "text-zinc-300",  bgClass: "bg-zinc-500/10" },
];

// Catálogo inicial. Marca algunos como instalados para que la pantalla se vea viva.
export const DEFAULT_DEVICES: DomoticaDevice[] = [
  // ILUMINACIÓN
  { id: "luz-sala",      category: "iluminacion", name: "Luz Sala",       icon: Lightbulb, control: "dimmer", is_installed: true,  is_on: true,  value: 80 },
  { id: "luz-cocina",    category: "iluminacion", name: "Luz Cocina",     icon: Lightbulb, control: "dimmer", is_installed: true,  is_on: false, value: 100 },
  { id: "luz-comedor",   category: "iluminacion", name: "Luz Comedor",    icon: Lamp,      control: "dimmer", is_installed: true,  is_on: false, value: 60 },
  { id: "luz-rec-prin",  category: "iluminacion", name: "Luz Rec. Principal", icon: Lightbulb, control: "dimmer", is_installed: true,  is_on: false, value: 70 },
  { id: "luz-rec-1",     category: "iluminacion", name: "Luz Recámara 1", icon: Lightbulb, control: "dimmer", is_installed: false },
  { id: "luz-rec-2",     category: "iluminacion", name: "Luz Recámara 2", icon: Lightbulb, control: "dimmer", is_installed: false },
  { id: "luz-bano-prin", category: "iluminacion", name: "Luz Baño Princ.",icon: Lightbulb, control: "toggle", is_installed: true,  is_on: false },
  { id: "luz-bano-vis",  category: "iluminacion", name: "Luz Baño Visitas",icon: Lightbulb,control: "toggle", is_installed: false },
  { id: "luz-pasillo",   category: "iluminacion", name: "Luz Pasillo",    icon: Lightbulb, control: "toggle", is_installed: false },
  { id: "luz-garage",    category: "iluminacion", name: "Luz Garage",     icon: Lightbulb, control: "toggle", is_installed: true,  is_on: false },
  { id: "luz-patio",     category: "iluminacion", name: "Luz Patio",      icon: Lightbulb, control: "toggle", is_installed: false },
  { id: "luz-fachada",   category: "iluminacion", name: "Luz Fachada",    icon: Lightbulb, control: "toggle", is_installed: false },

  // CLIMA
  { id: "ac-sala",       category: "clima", name: "A/C Sala",       icon: Snowflake,    control: "thermostat", is_installed: true,  is_on: true,  temp: 22 },
  { id: "ac-rec-prin",   category: "clima", name: "A/C Rec. Princ.",icon: Snowflake,    control: "thermostat", is_installed: true,  is_on: false, temp: 24 },
  { id: "ac-rec-1",      category: "clima", name: "A/C Recámara 1", icon: Snowflake,    control: "thermostat", is_installed: false },
  { id: "ventilador-sala",category:"clima", name: "Ventilador Sala",icon: Fan,          control: "toggle",     is_installed: false },
  { id: "calefactor",    category: "clima", name: "Calefactor",     icon: Thermometer,  control: "toggle",     is_installed: false },

  // CORTINAS
  { id: "cortina-sala",  category: "cortinas", name: "Cortina Sala",     icon: Blinds, control: "blinds", is_installed: true,  is_on: false, value: 50 },
  { id: "cortina-rec",   category: "cortinas", name: "Cortina Recámara", icon: Blinds, control: "blinds", is_installed: false },
  { id: "cortina-comedor",category:"cortinas", name: "Cortina Comedor",  icon: Blinds, control: "blinds", is_installed: false },
  { id: "persiana-est",  category: "cortinas", name: "Persiana Estudio", icon: Blinds, control: "blinds", is_installed: false },

  // SEGURIDAD
  { id: "cerradura-prin",category: "seguridad", name: "Cerradura Principal", icon: Lock,    control: "toggle", is_installed: true,  is_on: true },
  { id: "cerradura-tras",category: "seguridad", name: "Cerradura Trasera",   icon: Lock,    control: "toggle", is_installed: false },
  { id: "puerta-garage", category: "seguridad", name: "Puerta Garage",       icon: DoorOpen,control: "toggle", is_installed: true,  is_on: false },
  { id: "cam-entrada",   category: "seguridad", name: "Cámara Entrada",      icon: Camera,  control: "camera", is_installed: true,  is_on: true },
  { id: "cam-patio",     category: "seguridad", name: "Cámara Patio",        icon: Camera,  control: "camera", is_installed: false },
  { id: "cam-garage",    category: "seguridad", name: "Cámara Garage",       icon: Camera,  control: "camera", is_installed: false },
  { id: "timbre",        category: "seguridad", name: "Timbre Inteligente",  icon: Bell,    control: "toggle", is_installed: false },
  { id: "alarma",        category: "seguridad", name: "Alarma General",      icon: Siren,   control: "toggle", is_installed: true,  is_on: false },

  // RIEGO
  { id: "riego-jardin",  category: "riego", name: "Riego Jardín",   icon: Sprout,  control: "toggle", is_installed: true,  is_on: false },
  { id: "riego-macetas", category: "riego", name: "Riego Macetas",  icon: Droplets,control: "toggle", is_installed: false },
  { id: "riego-pasto",   category: "riego", name: "Riego Pasto",    icon: Sprout,  control: "toggle", is_installed: false },

  // OTROS
  { id: "tv-sala",       category: "otros", name: "TV Sala",        icon: Tv,             control: "toggle", is_installed: false },
  { id: "bocina-sala",   category: "otros", name: "Bocina Sala",    icon: Speaker,        control: "toggle", is_installed: false },
  { id: "lavadora",      category: "otros", name: "Lavadora",       icon: WashingMachine, control: "toggle", is_installed: false },
  { id: "refri",         category: "otros", name: "Refrigerador",   icon: Refrigerator,   control: "toggle", is_installed: false },
  { id: "microondas",    category: "otros", name: "Microondas",     icon: Microwave,      control: "toggle", is_installed: false },
  { id: "router",        category: "otros", name: "Router WiFi",    icon: Wifi,           control: "toggle", is_installed: true,  is_on: true },
  { id: "enchufe-1",     category: "otros", name: "Enchufe Estudio",icon: Plug,           control: "toggle", is_installed: false },
];
