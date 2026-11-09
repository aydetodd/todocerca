// Único lugar donde se decide a qué cubeta pertenece cada movimiento
// y con qué nombre se le muestra al usuario. Solo lectura: nunca escribe.

export type Ambito = "eje" | "sub_qr" | "cobros";

export type MovBase = {
  id: string;
  tipo: string;
  monto_mxn: number;
  descripcion: string | null;
  created_at: string;
  comercio_nombre?: string | null;
  sub_qr_id: string | null;
  metadata?: Record<string, unknown> | null;
  ambito?: string | null;
  direccion?: string | null;
  comision_mxn?: number | null;
};

export type RenglonLibro = {
  key: string;
  ambito: Ambito;
  subQrId: string | null; // solo cuando ambito = sub_qr
  monto: number; // con signo
  etiqueta: string;
  detalle?: string;
  created_at: string;
  folio?: string;
  comprobante?: Comprobante;
  importeReferencia?: number;
  estado?: "Completado";
  esComision?: boolean;
  refundMovementId?: string;
};

/** Datos para cotejar un movimiento. Nunca incluye CVV ni números completos. */
export type Comprobante = {
  contraparte?: string;
  sucursal?: string;
  terminal?: string;
  metodo?: string;
  comision?: number;
};

/** Folio legible: QRD-AAAAMMDD-XXXXXX (fecha Hermosillo). Ambos lados de una misma operación comparten folio. */
export function folioMovimiento(m: Pick<MovBase, "id" | "created_at" | "metadata">): string {
  const md = (m.metadata ?? {}) as Record<string, unknown>;
  const base = String(md.operation_key || m.id || "").replace(/-/g, "");
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Hermosillo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(m.created_at)).replace(/-/g, "");
  return `QRD-${f}-${base.slice(0, 6).toUpperCase()}`;
}

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function comprobanteMovimiento(m: MovBase): Comprobante {
  const md = (m.metadata ?? {}) as Record<string, unknown>;
  const flujo = txt(md.flujo);
  const metodo = flujo === "payer_qr" ? "QR del cliente" : md.terminal === "collection" ? "Terminal de cobro" : md.terminal === "reload" ? "Recarga en comercio" : flujo === "manual" ? "Captura manual" : undefined;
  const com = Number(m.comision_mxn ?? md.comision_recarga ?? 0);
  return {
    contraparte: txt(m.comercio_nombre) && m.comercio_nombre !== "Cobro de viajes" ? txt(m.comercio_nombre) : undefined,
    sucursal: txt(md.sucursal_nombre),
    terminal: txt(md.terminal_nombre),
    metodo,
    comision: com > 0 ? com : undefined,
  };
}

export type InfoPasaje = { ruta: string; viajeAt: string | null; auto: boolean };

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Hermosillo" }).format(new Date(iso));

/** "Pasaje · Ruta 3" y, si fue cobro automático, "viaje del X, aplicado el Y". */
export function etiquetaPasaje(info: InfoPasaje, aplicadoAt: string): { etiqueta: string; detalle?: string } {
  const etiqueta = `Pasaje · ${info.ruta}`;
  if (!info.auto) return { etiqueta };
  const viaje = info.viajeAt ? `viaje del ${fechaLarga(info.viajeAt)}, ` : "";
  return { etiqueta, detalle: `${viaje}aplicado el ${fechaLarga(aplicadoAt)}` };
}

export const MENSAJE_ERROR_AMABLE = "No se pudo completar en este momento; intenta de nuevo";

const ETIQUETAS: Record<Ambito, Record<string, string>> = {
  eje: {
    recarga: "Recarga",
    comision: "Comisión",
    transfer_a_sub: "Pasé saldo a sub-QR",
    transfer_desde_sub: "Saldo devuelto de sub-QR",
    transferencia_p2p_in: "Transferencia recibida",
    transferencia_p2p_out: "Transferencia enviada",
    traspaso_cobros_in: "Traspaso recibido de cobros",
    cobro_comercio: "Cobro en comercio",
    devolucion: "Devolución",
    ajuste: "Movimiento de saldo",
    retiro_qard: "Transferencia enviada",
    retiro_oxxo: "Retiro en OXXO",
    retiro_spei: "Envío SPEI",
  },
  sub_qr: {
    transfer_a_sub: "Recibido de cuenta eje",
    transfer_desde_sub: "Devuelto a cuenta eje",
    transferencia_p2p_in: "Transferencia recibida",
    transferencia_p2p_out: "Transferencia enviada",
    cobro_comercio: "Cobro en comercio",
    devolucion: "Devolución",
  },
  cobros: {
    cobro_recibido: "Cobro recibido",
    transferencia_p2p_in: "Transferencia recibida",
    transferencia_p2p_out: "Transferencia enviada",
    cobro_comercio: "Pago en comercio",
    traspaso_cobros_out: "Traspaso a mi cuenta eje",
    retiro_qard: "Retiro a otra QaRd",
    retiro_oxxo: "Retiro en OXXO",
    retiro_spei: "Envío SPEI",
  },
};

export function etiquetaMovimiento(ambito: Ambito, tipo: string): string {
  return ETIQUETAS[ambito][tipo] ?? "Movimiento";
}

const alias = (d: string | null) =>
  (d || "").replace(/^(Asignado a sub-QR |Retirado de sub-QR )/, "").trim();

/**
 * Convierte movimientos crudos en renglones de libro por cubeta.
 * Los que cruzan cubetas (eje <-> sub-QR) salen en dos renglones con signo opuesto.
 */
export function construirLibro(movs: MovBase[], titularSubId: string | null | undefined, pasajes?: Map<string, InfoPasaje>): RenglonLibro[] {
  const out: RenglonLibro[] = [];
  const partialTotals = new Map<string, number>();
  for (const m of movs) {
    const original = txt(m.metadata?.original_movimiento_id);
    const index = Number(m.metadata?.partial_index ?? 0);
    if (original && index > 0) partialTotals.set(original, Math.max(partialTotals.get(original) ?? 0, index));
  }
  for (const m of movs) {
    const abs = Math.abs(Number(m.monto_mxn ?? 0));
    const md = (m.metadata ?? {}) as Record<string, unknown>;
    const esSub = !!m.sub_qr_id && m.sub_qr_id !== titularSubId;
    const folio = folioMovimiento(m);
    const comprobante = comprobanteMovimiento(m);
    const push = (ambito: Ambito, monto: number, etiqueta: string, sufijo = "", subQrId: string | null = null) =>
      out.push({ key: m.id + sufijo, ambito, subQrId, monto, etiqueta, created_at: m.created_at, folio, comprobante, estado: "Completado", esComision: m.tipo === "comision" || sufijo === "-ap" || sufijo === "-fee", refundMovementId: ["cobro_comercio", "cobro_recibido"].includes(m.tipo) && typeof md.operation_key === "string" && (md.terminal === "collection" || md.flujo === "payer_qr") ? m.id : undefined });

    switch (m.tipo) {
      case "recarga": {
        const ap = Number(md.apertura ?? 0), fee = Number(md.comision_recarga ?? 0), bruto = Number(md.monto_transferido ?? 0);
        if (bruto > 0 && (ap > 0 || fee > 0)) {
          if (ap > 0) push("eje", -ap, "Comisión por apertura de cuenta", "-ap");
          if (fee > 0) push("eje", -fee, "Comisión por recarga", "-fee");
          push("eje", bruto, "Recarga", "-rec");
        } else push("eje", abs, "Recarga");
        break;
      }
      case "ajuste": {
        const ap = Number(md.apertura ?? 0), fee = Number(md.comision_recarga ?? 0);
        if (ap > 0 && fee > 0) {
          push("eje", -ap, "Comisión por apertura de cuenta", "-ap");
          push("eje", -fee, "Comisión por recarga", "-fee");
        } else push("eje", Number(m.monto_mxn), ETIQUETAS.eje.ajuste);
        break;
      }
      case "comision":
        push("eje", -abs, (m.descripcion || "Comisión").replace(/ajuste/gi, "Movimiento"));
        break;
      case "transfer_a_sub":
        push("eje", -abs, `Pasé saldo a ${alias(m.descripcion) || "sub-QR"}`, "-eje");
        if (m.sub_qr_id) push("sub_qr", abs, ETIQUETAS.sub_qr.transfer_a_sub, "-sub", m.sub_qr_id);
        break;
      case "transfer_desde_sub":
        if (m.sub_qr_id) push("sub_qr", -abs, ETIQUETAS.sub_qr.transfer_desde_sub, "-sub", m.sub_qr_id);
        push("eje", abs, `Saldo devuelto de ${alias(m.descripcion) || "sub-QR"}`, "-eje");
        break;
      case "transferencia_p2p_in":
        if (md.bolsa !== "comercio" && md.terminal === "reload" && Number(md.comision_comercio) === 5) {
          push("eje", abs, "Comisión por recarga en comercio");
          break;
        }
        if (m.comercio_nombre === "Cobro de viajes" || md.bolsa === "rutas") {
          push(esSub ? "sub_qr" : "eje", abs, "Transferencia recibida de rutas", "", esSub ? m.sub_qr_id : null);
          break;
        }
      // falls through
      case "transferencia_p2p_out":
      case "cobro_comercio": {
        const positivo = m.tipo === "transferencia_p2p_in";
        const amb: Ambito = md.bolsa === "comercio" ? "cobros" : esSub ? "sub_qr" : "eje";
        const pj = m.tipo === "cobro_comercio" ? pasajes?.get(m.id) : undefined;
        if (pj) {
          const { etiqueta, detalle } = etiquetaPasaje(pj, m.created_at);
          out.push({ key: m.id, ambito: amb, subQrId: esSub ? m.sub_qr_id : null, monto: -abs, etiqueta, detalle, created_at: m.created_at, folio, comprobante });
          break;
        }
        let et = etiquetaMovimiento(amb, m.tipo);
        if (m.tipo === "transferencia_p2p_out" && md.terminal === "reload") et = "Fondos para recarga de cliente";
        if (m.tipo === "cobro_comercio" && m.comercio_nombre) et = m.comercio_nombre.startsWith("Cobro automático") ? m.comercio_nombre : `${et} · ${m.comercio_nombre}`;
        push(amb, positivo ? abs : -abs, et, "", esSub ? m.sub_qr_id : null);
        break;
      }
      case "devolucion":
      case "reembolso":
      case "refund": {
        const amb: Ambito = m.ambito === "cobros" || md.bolsa === "comercio" ? "cobros" : esSub ? "sub_qr" : "eje";
        const original = txt(md.original_folio);
        const received = md.refund_received === true || (md.refund_received === undefined && m.direccion !== "salida");
        const partialIndex = Number(md.partial_index ?? 0);
        const partialTotal = partialTotals.get(txt(md.original_movimiento_id) ?? "") ?? partialIndex;
        const partialDetail = partialIndex > 0 && Number(md.original_amount ?? abs) > abs
          ? ` · Devolución parcial (${partialIndex} de ${partialTotal}) del folio ${original} · Restante tras esta devolución: $${Number(md.remaining_after ?? 0).toFixed(2)}` : "";
        out.push({ key: m.id, ambito: amb, subQrId: amb === "sub_qr" ? m.sub_qr_id : null,
          monto: received ? abs : -abs, importeReferencia: -abs, etiqueta: "Devolución",
          detalle: (original ? `Devolución del folio original: ${original}` : "Folio original no registrado en este movimiento histórico") + partialDetail + (txt(md.reason) ? ` · Motivo: ${txt(md.reason)}` : "") + (txt(md.decision_reason) ? ` · Respuesta: ${txt(md.decision_reason)}` : ""),
          created_at: m.created_at, folio, comprobante, estado: "Completado" });
        break;
      }
      case "cobro_recibido":
        push("cobros", abs, ETIQUETAS.cobros.cobro_recibido);
        break;
      case "traspaso_cobros_out":
        push("cobros", -abs, ETIQUETAS.cobros.traspaso_cobros_out);
        break;
      case "traspaso_cobros_in":
        push("eje", abs, ETIQUETAS.eje.traspaso_cobros_in);
        break;
      default:
        if (m.tipo.startsWith("retiro_") && (md.bolsa === "rutas" || md.batch_id)) {
          // Salida del pozo de rutas: solo vive en el libro de la ruta, nunca en eje ni cobros.
        } else if (m.tipo.startsWith("retiro_")) {
          const amb: Ambito = m.ambito === "cobros" || md.bolsa === "comercio" ? "cobros" : "eje";
          push(amb, -abs, etiquetaMovimiento(amb, m.tipo));
        } else {
          const amb = (m.ambito as Ambito) || "eje";
          push(amb, m.direccion === "entrada" ? abs : -abs, etiquetaMovimiento(amb, m.tipo), "", amb === "sub_qr" ? m.sub_qr_id : null);
        }
    }
  }
  return out;
}

/** Filtra una cubeta y calcula saldos corridos desde el saldo vivo actual hacia atrás. */
export function estadoDeCuenta(
  libro: RenglonLibro[],
  ambito: Ambito,
  saldoVivo: number,
  subQrId?: string | null,
) {
  const propios = libro
    .filter(r => r.ambito === ambito && (ambito !== "sub_qr" || r.subQrId === subQrId))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  let corrido = Number(saldoVivo ?? 0);
  return propios.map(r => {
    const saldoDespues = +corrido.toFixed(2);
    corrido = +(corrido - r.monto).toFixed(2);
    return { r, monto: r.monto, saldoDespues, saldoAntes: corrido };
  });
}
