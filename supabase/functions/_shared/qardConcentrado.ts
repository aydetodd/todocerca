import { construirLibro, estadoDeCuenta, type MovBase } from './qardEtiquetas.ts';

export type Address = { id: string; version: number; progress: number; status: string; calle: string; numero: string; colonia: string; cp: string; municipio: string; estado: string };
export type DocumentSource = { qard: string; index: number; name: string; balance: number; principal_id: string; card_id: string | null; start: string; end: string; address: Address | null; movements: MovBase[] };
export type ConcentratedRow = { date: string; concept: string; reference: string; income: number; outgoing: number; balance: number };
const cents = (n: number) => Math.round(Number(n) * 100);
export const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
export function calendarDay(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export function printDate(iso: string) {
  const parts = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Hermosillo', day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value.replace('.', '') ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}
/** Never derive a counterparty card from a folio, a phone, a name or a last-four suffix. */
export function referenceFor(m: MovBase | undefined): string {
  const md = m?.metadata ?? {};
  for (const key of ['counterparty_qard', 'qard_origen', 'qard_destino', 'origen', 'destino']) {
    const value = md[key];
    if (typeof value === 'string' && /^\d{16}$/.test(value)) return value.slice(-9);
  }
  return '';
}
export function compactConcept(type: string, incoming: boolean): string {
  if (/devolucion|reembolso|refund/.test(type)) return 'Devolución';
  if (/comision/.test(type)) return 'Comisión';
  if (/recarga/.test(type)) return 'Recarga';
  if (/cobro/.test(type)) return incoming ? 'Cobro' : 'Pago';
  if (/pago/.test(type)) return 'Pago';
  if (/bono/.test(type)) return 'Bono';
  if (/retiro/.test(type)) return 'Retiro';
  return 'Transferencia';
}

export function concentratedStatement(source: DocumentSource) {
  const movements = source.movements;
  let entries: { key: string; date: string; amount: number; type: string; reference: string }[];
  if (source.index === 10) {
    entries = movements.filter(m => typeof m.metadata?.bolsillo_id === 'string').map(m => ({ key: m.id, date: m.created_at,
      amount: -Number(m.monto_mxn), type: 'transferencia', reference: source.qard.slice(0, 14).concat('00').slice(-9) }));
  } else if (source.index >= 2 && source.index <= 6) {
    entries = movements.filter(m => m.sub_qr_id === source.card_id && (m.ambito === 'bonos' || m.metadata?.bolsa === 'bono')).map(m => ({ key: m.id, date: m.created_at,
      amount: m.direccion === 'entrada' || m.tipo === 'bono_recibido' ? Math.abs(Number(m.monto_mxn)) : -Math.abs(Number(m.monto_mxn)), type: m.tipo, reference: referenceFor(m) }));
  } else {
    const raw = new Map(movements.map(m => [m.id, m]));
    const rows = estadoDeCuenta(construirLibro(movements, source.principal_id), source.index === 0 ? 'eje' : source.index === 1 ? 'cobros' : 'sub_qr', Number(source.balance), source.card_id);
    entries = rows.map(f => {
      const m = raw.get(f.r.key) ?? movements.find(m => f.r.key.startsWith(m.id));
      return { key: f.r.key, date: f.r.created_at, amount: f.monto, type: f.r.esComision ? 'comision' : m?.tipo ?? 'transferencia', reference: referenceFor(m) };
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const final = cents(source.balance);
  const initial = final - entries.reduce((n, e) => n + cents(e.amount), 0);
  let running = initial, income = 0, outgoing = 0;
  const grouped = new Map<string, { date: string; concept: string; reference: string; inCents: number; outCents: number }>();
  for (const e of entries) {
    const value = cents(e.amount), concept = compactConcept(e.type, value > 0);
    const key = `${calendarDay(e.date)}|${concept}|${e.reference}`;
    const row = grouped.get(key) ?? { date: e.date, concept, reference: e.reference, inCents: 0, outCents: 0 };
    if (value > 0) { row.inCents += value; income += value; } else { row.outCents -= value; outgoing -= value; }
    grouped.set(key, row);
  }
  const rows: ConcentratedRow[] = [{ date: source.start, concept: 'Saldo Inicial', reference: '', income: 0, outgoing: 0, balance: initial / 100 }];
  for (const row of grouped.values()) {
    running += row.inCents - row.outCents;
    rows.push({ date: row.date, concept: row.concept, reference: row.reference, income: row.inCents / 100, outgoing: row.outCents / 100, balance: running / 100 });
  }
  return { rows, initial: initial / 100, income: income / 100, outgoing: outgoing / 100, final: final / 100, reconciled: running === final };
}

/** Trusted evidence only; a browser selfie or GPS fix is not a verified event. */
export type PresenceEvent = { time: string; trusted: boolean; distance: number; accuracy: number; lifeHash: string; receipt: string };
export function presenceProgress(events: PresenceEvent[], now: string): number {
  const end = new Date(now).getTime();
  const valid = events.filter(e => e.trusted && e.lifeHash && e.receipt && e.distance <= 100 && e.distance >= 0 && e.accuracy > 0 && e.accuracy <= 100 && new Date(e.time).getTime() <= end && new Date(e.time).getTime() >= end - 7 * 86400000)
    .sort((a, b) => a.time.localeCompare(b.time));
  const days = new Set<string>(), lives = new Set<string>(), receipts = new Set<string>();
  const unique = valid.filter(e => {
    const day = calendarDay(e.time);
    if (days.has(day) || lives.has(e.lifeHash) || receipts.has(e.receipt)) return false;
    days.add(day); lives.add(e.lifeHash); receipts.add(e.receipt); return true;
  });
  const first = unique[0];
  if (!first) return 0;
  if (unique.length >= 3 && new Date(unique[unique.length - 1].time).getTime() - new Date(first.time).getTime() >= 86400000) return 3;
  return Math.min(2, unique.length);
}