import type { estadoDeCuenta } from "./qardEtiquetas";

export type StatementRows = ReturnType<typeof estadoDeCuenta>;
export const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
export const maskedQard = (n: string) => n ? `QaRd •••• ${n.replace(/\D/g, "").slice(-4)}` : "QaRd sin emitir";
const cents = (n: number) => Math.round(n * 100);

export function statementSummary(rows: StatementRows, live: number) {
  const initial = cents(rows[rows.length - 1]?.saldoAntes ?? live);
  const final = cents(rows[0]?.saldoDespues ?? live);
  let income = 0, outgoing = 0, fees = 0;
  for (const f of rows) {
    const amount = cents(f.monto);
    if (amount > 0) income += amount;
    else if (f.r.esComision) fees -= amount;
    else outgoing -= amount;
  }
  return { initial: initial / 100, final: final / 100, income: income / 100, outgoing: outgoing / 100, fees: fees / 100,
    reconciled: initial + income - outgoing - fees === final };
}
export function summaryText(s: ReturnType<typeof statementSummary>) {
  return `Saldo inicial (${money(s.initial)}) + Entradas (${money(s.income)}) − Salidas (${money(s.outgoing)}) − Comisiones (${money(s.fees)}) = Saldo Final (${money(s.final)})`;
}