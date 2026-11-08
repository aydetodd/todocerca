import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/csvExport";
import { estadoDeCuenta, type Ambito, type RenglonLibro } from "@/lib/qardEtiquetas";
import { formatHermosillo, getHermosilloToday } from "@/lib/utils";
import { maskedQard, money, statementSummary, summaryText } from "@/lib/qardStatement";
import { downloadStatementPdf } from "@/lib/qardStatementPdf";

type Props = { titulo: string; numero: string; libro: RenglonLibro[]; ambito: Ambito; saldoVivo: number; subId?: string | null; periodo: number; setPeriodo: (d: number) => void };
export default function QardStatement({ titulo, numero, libro, ambito, saldoVivo, subId, periodo, setPeriodo }: Props) {
  const generated = useMemo(() => new Date().toISOString(), [libro, periodo, saldoVivo]);
  const end = getHermosilloToday();
  const startDate = new Date(`${end}T00:00:00-07:00`);
  startDate.setUTCDate(startDate.getUTCDate() - periodo + 1);
  const start = startDate.toISOString();
  const rows = estadoDeCuenta(libro, ambito, saldoVivo, subId).filter(f => f.r.created_at >= start && f.r.created_at <= generated);
  const periodLabel = `${formatHermosillo(start)} — ${formatHermosillo(generated)}`;
  const summary = statementSummary(rows, saldoVivo);
  const csv = () => downloadCSV(`QaRd-${ambito}-${end}.csv`,
    ["Folio", "Fecha (Hermosillo)", "Concepto", "Detalle", "Contraparte", "Sucursal", "Terminal", "Método", "Importe de referencia", "Entrada", "Salida", "Comisión", "Saldo", "Estado"],
    [
      [titulo, maskedQard(numero), periodLabel, `Generado: ${formatHermosillo(generated)}`],
      [summaryText(summary)],
      ...rows.map(f => { const c = f.r.comprobante; return [f.r.folio ?? "", formatHermosillo(f.r.created_at), f.r.etiqueta, f.r.detalle ?? "", c?.contraparte ?? "", c?.sucursal ?? "", c?.terminal ?? "", c?.metodo ?? "", f.r.importeReferencia?.toFixed(2) ?? "", f.monto > 0 ? f.monto.toFixed(2) : "", f.monto < 0 && !f.r.esComision ? (-f.monto).toFixed(2) : "", f.r.esComision ? (-f.monto).toFixed(2) : "", f.saldoDespues.toFixed(2), "Completado"]; }),
    ]);
  return <section className="min-w-0 space-y-3" aria-label={`Estado de cuenta ${titulo}`}>
    <div className="flex gap-1">{[[7,"7 días"],[15,"15 días"],[30,"1 mes"],[62,"2 meses"]].map(([d,label]) => <Button key={d} size="sm" variant={periodo === d ? "default" : "outline"} className="flex-1 px-1 text-xs" onClick={() => setPeriodo(Number(d))}>{label}</Button>)}</div>
    <header className="space-y-2 border-b pb-3">
      <div className="font-mono font-semibold">{maskedQard(numero)}</div>
      <div className="text-xs text-muted-foreground break-words">Periodo: {periodLabel}<br />Generado: {formatHermosillo(generated)}</div>
      <p className="text-sm leading-relaxed break-words">{summaryText(summary)}</p>
      {!summary.reconciled && <p role="alert" className="text-sm text-destructive">Los movimientos no concilian. No uses este documento como comprobante.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={csv}><Download className="mr-1 h-4 w-4" />CSV</Button>
        <Button size="sm" variant="outline" onClick={() => downloadStatementPdf({ title: titulo, card: maskedQard(numero), period: periodLabel, generated, rows, summary })}><Download className="mr-1 h-4 w-4" />Descargar PDF</Button>
      </div>
    </header>
    <div className="max-h-[48vh] overflow-y-auto divide-y">
      {!rows.length && <p className="py-3 text-sm text-muted-foreground">Sin movimientos en este periodo.</p>}
      {rows.map(f => <article key={f.r.key} className="py-3 space-y-1">
        <div className="flex justify-between gap-3"><span className="min-w-0 break-words font-medium text-sm">{f.r.etiqueta}</span><span className="shrink-0 font-semibold text-sm">{money(f.r.importeReferencia ?? f.monto)}</span></div>
        {f.r.detalle && <p className="text-xs break-words">{f.r.detalle}</p>}
        <div className="text-xs text-muted-foreground">{formatHermosillo(f.r.created_at)} · Completado</div>
        <div className="font-mono text-xs break-all select-all">Folio {f.r.folio}</div>
        <div className="text-xs text-muted-foreground break-words">{[f.r.comprobante?.contraparte, f.r.comprobante?.sucursal, f.r.comprobante?.terminal, f.r.comprobante?.metodo].filter(Boolean).join(" · ")}</div>
        {f.r.comprobante?.comision && <div className="text-xs text-muted-foreground">Comisión informada: {money(f.r.comprobante.comision)}</div>}
        {f.r.importeReferencia !== undefined && <div className="text-xs">{f.monto > 0 ? "Entrada" : "Salida"}: {money(Math.abs(f.monto))}</div>}
        <div className="text-xs text-muted-foreground">Saldo {money(f.saldoDespues)}</div>
      </article>)}
      <div className="flex justify-between gap-2 py-3 text-sm"><span>Saldo inicial</span><strong>{money(summary.initial)}</strong></div>
    </div>
  </section>;
}