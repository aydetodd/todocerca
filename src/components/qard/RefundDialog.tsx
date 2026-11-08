import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/qardStatement";
import { refundAmount, refundStatus, type RefundContext, type RefundRequest } from "@/lib/qardRefunds";

export default function RefundDialog({ movementId, request, onClose, onChanged }: {
  movementId?: string; request?: RefundRequest; onClose: () => void; onChanged: () => void;
}) {
  const [context, setContext] = useState<RefundContext | null>(null);
  const [amount, setAmount] = useState(request ? String(request.requested_amount) : "");
  const [reason, setReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const key = useRef(crypto.randomUUID());
  const submitted = useRef<string | null>(request?.id ?? null);
  const submission = useRef<{ amount: number; reason: string } | null>(null);
  useEffect(() => {
    if (!movementId) return;
    let alive = true;
    void supabase.rpc("qard_refund_context", { _movement: movementId }).then(({ data, error: failure }) => {
      if (!alive) return;
      if (failure) { setError(failure.message); return; }
      const ctx = data as unknown as RefundContext;
      setContext(ctx); setAmount(String(Math.min(Number(ctx.remaining), Number(ctx.requests.find(r => r.status === "pending")?.requested_amount ?? ctx.remaining))));
    });
    return () => { alive = false; };
  }, [movementId]);
  const pending = request ?? context?.requests.find(r => r.status === "pending");
  const authorize = request?.can_authorize ?? context?.can_authorize ?? false;
  const maximum = Math.min(context?.remaining ?? Number(request?.requested_amount ?? 0), Number(pending?.requested_amount ?? context?.remaining ?? 0));
  const amountValue = refundAmount(amount, maximum);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "No se pudo completar. La solicitud permanece sin cambios.");
  const execute = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      let id = submitted.current ?? pending?.id;
      if (!id) {
        if (!movementId || amountValue === null || reason.trim().length < 3) throw new Error("Indica el monto y el motivo.");
        // Keep the original payload on ambiguous network retries; never issue a second request key.
        const payload = submission.current ?? { amount: amountValue, reason: reason.trim() };
        submission.current = payload;
        const { data, error: failure } = await supabase.rpc("qard_refund_submit", { _movement: movementId, _amount: payload.amount, _reason: payload.reason, _key: key.current });
        if (failure) throw new Error(failure.message);
        if (typeof data !== "string") throw new Error("No se recibió la confirmación de la solicitud.");
        id = data; submitted.current = id;
      }
      if (authorize) {
        if (!confirm) throw new Error("Confirma tu decisión.");
        const { data, error: failure } = await supabase.rpc("qard_refund_decide", { _request: id, _approve: confirm === "approve", _amount: confirm === "approve" ? amountValue ?? undefined : undefined, _reason: decisionReason.trim() || undefined });
        if (failure) throw new Error(failure.message);
        const result = data as { status?: string; amount?: number };
        if (result.status === "timed_out") { setSuccess("Rechazada por timeout: transcurrieron 72 horas. El cliente puede abrir una disputa."); onChanged(); return; }
        if (result.status !== "completed" && result.status !== "rejected") throw new Error("No se recibió la confirmación de la decisión.");
        setSuccess(result.status === "completed" ? `Devolución completada: ${money(Number(result.amount))}. El dinero regresó a la tarjeta que pagó.` : "Solicitud rechazada. No se movió dinero.");
      } else setSuccess("Solicitud enviada al negocio. Todavía no se ha movido dinero.");
      onChanged();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const ready = request || context;
  const partial = amountValue !== null && amountValue < Number(pending?.requested_amount ?? amountValue);
  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{authorize ? "Autorizar devolución" : "Solicitar devolución"}</DialogTitle></DialogHeader>
    {success ? <div className="space-y-4"><p role="status">{success}</p><Button className="w-full" onClick={onClose}>Entendido</Button></div> : <div className="space-y-4">
      <p className="font-mono text-xs break-all">{request?.original_folio ?? context?.original_folio}</p>
      {context && <p className="text-sm">Cobro original: {money(Number(context.original_amount))}<br />Disponible para devolver: {money(Number(context.remaining))}</p>}
      {pending && <div className="space-y-1 text-sm"><p>{refundStatus[pending.status]} · Solicitado: {money(Number(pending.requested_amount))}</p><p>Motivo: {pending.reason}</p></div>}
      {ready && pending && pending.status !== "pending" ? <p className="text-sm">{pending.decision_reason}</p> : ready && (!pending || authorize) && maximum > 0 ? <>
        <div className="space-y-1"><Label htmlFor="refund-amount">{authorize ? "Monto a devolver" : "Monto solicitado"}</Label><Input id="refund-amount" inputMode="decimal" value={amount} disabled={busy || !!confirm} onChange={e => setAmount(e.target.value)} /></div>
        {!pending && <div className="space-y-1"><Label htmlFor="refund-reason">Motivo</Label><select id="refund-reason" className="w-full rounded-md border border-input bg-background p-2 text-sm" value={["Cobro duplicado","Monto incorrecto","Producto devuelto","Servicio cancelado","Otro"].includes(reason) ? reason : ""} disabled={busy || !!confirm} onChange={e => setReason(e.target.value)}><option value="">Seleccionar motivo</option>{["Cobro duplicado","Monto incorrecto","Producto devuelto","Servicio cancelado","Otro"].map(r => <option key={r}>{r}</option>)}</select><Textarea aria-label="Detalle del motivo" maxLength={500} value={reason} disabled={busy || !!confirm} onChange={e => setReason(e.target.value)} /></div>}
        {authorize && <div className="space-y-1"><Label htmlFor="refund-decision">Explicación {partial ? "(obligatoria para devolución parcial)" : "(obligatoria para rechazar)"}</Label><Textarea id="refund-decision" maxLength={500} value={decisionReason} disabled={busy || !!confirm} onChange={e => setDecisionReason(e.target.value)} /></div>}
        {confirm ? <div className="space-y-3 border-t pt-3"><p className="text-sm">{confirm === "approve" ? `¿Devolver ${money(amountValue ?? 0)} del saldo Empresarial a la misma tarjeta que pagó?` : "¿Rechazar esta solicitud sin devolver dinero?"}</p><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Volver</Button><Button disabled={busy} onClick={() => void execute()}>{busy ? "Procesando…" : "Confirmar"}</Button></div></div> : <div className="flex flex-wrap gap-2">
          {authorize ? <><Button disabled={busy || amountValue === null || (!pending && reason.trim().length < 3) || (partial && decisionReason.trim().length < 3)} onClick={() => setConfirm("approve")}>Devolver dinero</Button>{pending && <Button variant="outline" disabled={busy || decisionReason.trim().length < 3} onClick={() => setConfirm("reject")}>Rechazar</Button>}</> : <Button disabled={busy || amountValue === null || reason.trim().length < 3} onClick={() => void execute()}>{busy ? "Enviando…" : "Enviar solicitud"}</Button>}
        </div>}
      </> : ready && !pending ? <p>Este cobro ya fue devuelto por completo.</p> : null}
      {!ready && !error && <p className="text-sm text-muted-foreground">Cotejando cobro original…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
  </DialogContent></Dialog>;
}