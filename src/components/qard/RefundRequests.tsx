import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/qardStatement";
import { formatHermosillo } from "@/lib/utils";
import { refundStatus, type RefundRequest } from "@/lib/qardRefunds";
import type { Ambito } from "@/lib/qardEtiquetas";
import RefundDialog from "./RefundDialog";

export default function RefundRequests({ ambito, subId, onChanged }: { ambito: Ambito; subId?: string | null; onChanged?: () => void }) {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [selected, setSelected] = useState<RefundRequest | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const all: RefundRequest[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error: failure } = await supabase.rpc("qard_refund_list", { _ambito: ambito, _sub: subId ?? undefined, _offset: offset });
      if (failure) { setError("No se pudieron consultar las devoluciones."); return; }
      const page = (data ?? []) as unknown as RefundRequest[];
      all.push(...page);
      if (page.length < 100) break;
    }
    setRequests(all); setError("");
  }, [ambito, subId]);
  useEffect(() => {
    void load();
    const channel = supabase.channel(`refunds-${ambito}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_refund_requests" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, ambito]);
  return <section aria-label="Devoluciones" className="space-y-2">
    <h3 className="text-sm font-semibold">Devoluciones</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!requests.length && !error && <p className="text-xs text-muted-foreground">Sin solicitudes de devolución.</p>}
    <div className="divide-y max-h-64 overflow-y-auto">{requests.map(r => <article key={r.id} className="py-2 space-y-1 text-xs">
      <div className="flex justify-between gap-2"><span>{refundStatus[r.status]}</span><strong>{money(Number(r.approved_amount ?? r.requested_amount))}</strong></div>
      <p className="font-mono break-all">{r.original_folio}</p><p className="break-words">Motivo: {r.reason}</p>
      {r.decision_reason && <p className="break-words">Respuesta: {r.decision_reason}</p>}
      <p className="text-muted-foreground">{formatHermosillo(r.created_at)}</p>
      {r.can_authorize && r.status === "pending" && <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Revisar solicitud</Button>}
    </article>)}</div>
    {selected && <RefundDialog request={selected} onClose={() => setSelected(null)} onChanged={() => { void load(); onChanged?.(); }} />}
  </section>;
}