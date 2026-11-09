import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { refundAmount, refundStatus, type RefundRequest } from "@/lib/qardRefunds";
import { money } from "@/lib/qardStatement";

export default function RefundActionDialog({ request, action, onClose, onChanged }: { request: RefundRequest; action: "cancel" | "dispute" | "resolve"; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(request.requested_amount));
  const [approve, setApprove] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const value = refundAmount(amount, Number(request.requested_amount));
  const valid = action === "cancel" || (reason.trim().length >= 3 && (action !== "resolve" || !approve || value !== null));
  const submit = async () => {
    if (busy || !confirmed || !valid) return;
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await supabase.rpc("qard_refund_action", { _request: request.id, _action: action, _reason: reason.trim() || undefined, _approve: action === "resolve" ? approve : undefined, _amount: action === "resolve" && approve ? value ?? undefined : undefined });
      if (failure) throw new Error(failure.message);
      const result = data as { status?: RefundRequest["status"] };
      if (!result.status || !(result.status in refundStatus)) throw new Error("No se recibió confirmación; consulta el estado antes de reintentar.");
      setSuccess(refundStatus[result.status]); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar. Consulta el estado antes de reintentar."); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{action === "cancel" ? "Cancelar solicitud" : action === "dispute" ? "Abrir disputa" : "Resolver disputa"}</DialogTitle></DialogHeader>
    <p className="font-mono text-xs break-all">{request.original_folio}</p><p>{money(Number(request.requested_amount))} · {request.reason}</p>
    {success ? <><p role="status">{success}</p><Button onClick={onClose}>Entendido</Button></> : <>
      {request.dispute_reason && <p>Disputa: {request.dispute_reason}</p>}
      {action !== "cancel" && <Textarea aria-label="Motivo de la disputa o resolución" maxLength={500} value={reason} disabled={confirmed || busy} onChange={e => setReason(e.target.value)} />}
      {action === "resolve" && <><div className="flex gap-2"><Button variant={approve ? "default" : "outline"} disabled={confirmed || busy} onClick={() => setApprove(true)}>Autorizar</Button><Button variant={!approve ? "default" : "outline"} disabled={confirmed || busy} onClick={() => setApprove(false)}>Rechazar</Button></div>{approve && <Input aria-label="Monto autorizado" inputMode="decimal" disabled={confirmed || busy} value={amount} onChange={e => setAmount(e.target.value)} />}</>}
      <p className="text-sm">{action === "dispute" ? "El importe quedará retenido hasta que TodoCerca decida." : action === "cancel" ? "Se cancelará la solicitud sin mover dinero." : approve ? "El dinero regresará a la tarjeta original." : "Se liberará el importe retenido sin devolución."}</p>
      {confirmed ? <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmed(false)}>Volver</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "Procesando…" : "Confirmar"}</Button></div> : <Button disabled={!valid} onClick={() => setConfirmed(true)}>Continuar</Button>}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </>}
  </DialogContent></Dialog>;
}