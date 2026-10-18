// Listas del módulo Fletes (editables aquí en un solo lugar).
export const MARCAS_UNIDAD = ["Kenworth", "Freightliner", "International", "Volvo", "Peterbilt", "Mack", "Mercedes-Benz", "Isuzu", "Hino", "Ford", "Chevrolet", "RAM", "Nissan", "Otra"];
export const CONDICIONES = ["100%", "90%", "80%", "70%", "60%", "50% o menos"];
export const REMOLQUES = ["Caja seca", "Caja refrigerada (thermo)", "Plataforma", "Cama baja", "Tolva", "Pipa / tanque", "Jaula ganadera", "Portacontenedor", "Redilas", "Torton", "Rabón", "Camioneta 3.5 t"];
export const DIMENSIONES = ["Camioneta 3.5 t", "Rabón (6 m)", "Torton (8 m)", "Caja 40 pies", "Caja 48 pies", "Caja 53 pies", "Full (doble remolque)"];
export const LUGARES_CARGA = ["Campo / rancho", "Empaque", "Bodega", "Fábrica / planta", "Puerto", "Central de abastos", "Otro"];
export const TEMPERATURAS = ["Ambiente (seco)", "Refrigerado (0 a 8 °C)", "Congelado (bajo 0 °C)", "Temperatura controlada"];
export const TAMANOS = DIMENSIONES;

export type FleteTipo = "transportista" | "remitente";

export function tipoContraparteFlete(tipo: FleteTipo | null): FleteTipo | null {
  return tipo === "transportista" ? "remitente" : tipo === "remitente" ? "transportista" : null;
}

/** La gestión solo incluye publicaciones del tipo registrado por su dueño. */
export function fletesGestionables(tipo: FleteTipo | null, anuncios: FleteAnuncio[]): FleteAnuncio[] {
  if (!tipo) return [];
  return anuncios.filter((anuncio) => anuncio.tipo === tipo);
}

const normalizar = (valor: string | null | undefined) => (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Compatibilidad simétrica: sin destinos preferidos se aceptan todos los destinos. */
export function fletesCompatibles(unidad: FleteAnuncio, carga: FleteAnuncio): boolean {
  if (unidad.tipo !== "transportista" || carga.tipo !== "remitente") return false;
  const destino = normalizar(carga.destino_municipio);
  const completo = normalizar(`${carga.destino_municipio ?? ""}, ${carga.destino_estado ?? ""}`);
  if (unidad.destinos_preferidos?.length && !unidad.destinos_preferidos.some((d) => [destino, completo].includes(normalizar(d)))) return false;
  if (carga.tamano && normalizar(carga.tamano) !== normalizar(unidad.dimensiones)) return false;
  if (carga.remolque && normalizar(carga.remolque) !== normalizar(unidad.remolque)) return false;
  if (/refrigerado|congelado/.test(normalizar(carga.temperatura)) && !/refrigerada|thermo/.test(normalizar(unidad.remolque))) return false;
  return true;
}

export function buscarFletesCompatibles(tipo: FleteTipo | null, propios: FleteAnuncio[], anuncios: FleteAnuncio[]): FleteAnuncio[] {
  const contraparte = tipoContraparteFlete(tipo);
  const criterios = propios.filter((a) => a.tipo === tipo && (tipo === "transportista" || a.disponible));
  if (!contraparte || !criterios.length) return [];
  return anuncios.filter((a) => a.tipo === contraparte && a.disponible && criterios.some((propio) =>
    propio.user_id !== a.user_id && (tipo === "transportista" ? fletesCompatibles(propio, a) : fletesCompatibles(a, propio))));
}

export interface FleteAnuncio {
  id: string;
  user_id: string;
  tipo: FleteTipo;
  titulo: string;
  marca: string | null; modelo: number | null; condiciones: string | null; remolque: string | null; dimensiones: string | null;
  ciudad_estado: string | null; ciudad_municipio: string | null; destinos_preferidos: string[];
  tipo_carga: string | null; lugar_carga: string | null; temperatura: string | null; tamano: string | null;
  destino_estado: string | null; destino_municipio: string | null;
  telefono: string | null; nombre_contacto: string | null;
  disponible: boolean; editado_at: string;
}

/** Enlace de WhatsApp con mensaje listo. `yoSoy` es el papel de quien escribe. */
export function enlaceWhatsAppFlete(a: FleteAnuncio, yoSoy: FleteTipo): string | null {
  const tel = String(a.telefono ?? "").replace(/\D/g, "");
  if (tel.length < 10) return null;
  const numero = tel.length === 10 ? `52${tel}` : tel;
  const papel = yoSoy === "transportista" ? "Transportista" : "Remitente de Carga";
  const msg = `Hola, soy ${papel} y vi tu anuncio "${a.titulo}" en TodoCerca Fletes. ¿Coordinamos los detalles?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}
