import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/qardStatement";
import { formatHermosillo } from "@/lib/utils";
import { claimIneligibility, refundAmount, refundExpiredMessage, refundReasons, withinRefundWindow, type RefundContext, type RefundPayment } from "@/lib/qardRefunds";
import RefundRequests from "./RefundRequests";

export default function RefundClaim({ admin = false }: { admin?: boolean }) {
  const [payments, setPayments] = useState<RefundPayment[]>([]);
  const [folio, setFolio] = useState("");
  const [payment, setPayment] = useState<RefundPayment | null>(null);
  const [context, setContext] = useState<RefundContext | null>(null);
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [now, setNow] = useState(Date.now());
  const key = useRef(crypto.randomUUID());
  const payload = useRef<{ movement: string; amount: number; reason: string } | null>(null);
  const load = useCallback(async () => {
    if (admin) return;
    const all: RefundPayment[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error: failure } = await supabase.rpc("qard_refund_payments", { _offset: offset });
      if (failure) { setError(failure.message); return; }
      const page = (data ?? []) as unknown as RefundPayment[];
      all.push(...page);
      if (page.length < 100) break;
    }
    setPayments(all);
  }, [admin]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const validate = async (selected?: RefundPayment) => {
    if (busy) return;
    setBusy(true); setError(""); setContext(null); setStep(2);
    try {
      let target = selected;
      if (!target) {
        const { data, error: failure } = await supabase.rpc("qard_refund_payments", { _folio: folio.trim().toUpperCase() });
        if (failure) throw new Error(failure.message);
        const matches = (data ?? []) as unknown as RefundPayment[];
        if (matches.length !== 1) throw new Error(matches.length ? "Este folio identifica más de un pago; selecciona el pago en la lista." : "Este cobro no es elegible porque el folio no existe o no pertenece a tu cuenta.");
        target = matches[0];
      }
      if (!target) throw new Error("Selecciona un pago.");
      setPayment(target); setFolio(target.original_folio);
      const { data, error: failure } = await supabase.rpc("qard_refund_context", { _movement: target.movement_id });
      if (failure) throw new Error(`Este cobro no es elegible porque ${failure.message}`);
      const ctx = data as unknown as RefundContext;
      setContext(ctx); setAmount(String(ctx.remaining));
      if (admin && ctx.requests.length) setError("Este cobro ya tiene una reclamación; revisa esa solicitud o disputa.");
      else if (!admin) setError(claimIneligibility(ctx) ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cotejar el pago."); }
    finally { setBusy(false); }
  };
  const eligibility = context && !admin ? claimIneligibility(context, now) : null;
  const validAmount = context ? refundAmount(amount, Number(context.remaining)) : null;
  const submit = async () => {
    if (busy || !payment || !context || validAmount === null || !reason || eligibility) return;
    if (admin && overrideReason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      const saved = payload.current ?? { movement: payment.movement_id, amount: validAmount, reason: admin ? overrideReason.trim() : `${reason}${details.trim() ? `: ${details.trim()}` : ""}` };
      payload.current = saved;
      const { data, error: failure } = admin
        ? await supabase.rpc("qard_refund_admin_force", { _movement: saved.movement, _amount: saved.amount, _reason: saved.reason, _key: key.current })
        : await supabase.rpc("qard_refund_submit", { _movement: saved.movement, _amount: saved.amount, _reason: saved.reason, _key: key.current });
      if (failure) throw new Error(failure.message === "Plazo vencido" ? refundExpiredMessage : failure.message);
      if (admin ? (data as { status?: string })?.status !== "completed" : typeof data !== "string") throw new Error("No se recibió confirmación; reintenta sin cambiar los datos.");
      setSuccess(admin ? "Devolución completada. Motivo y administrador quedaron registrados." : "Reclamación enviada. El comercio tiene 72 horas para responder; todavía no se ha movido dinero.");
      void load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar la reclamación."); }
    finally { setBusy(false); }
  };
  const reset = () => { setStep(1); setContext(null); setPayment(null); setError(""); setSuccess(""); setReason(""); setDetails(""); setOverrideReason(""); setFolio(""); key.current = crypto.randomUUID(); payload.current = null; };
  return <section className="space-y-5 pb-40 min-w-0" aria-label={admin ? "Devolución excepcional" : "Reclamar una devolución"}>
    <h2 className="text-xl font-semibold">{admin ? "Devolución excepcional · admin" : "Reclamar una devolución"}</h2>
    {success ? <div className="space-y-3"><p role="status">{success}</p><Button variant="outline" onClick={reset}>Entendido</Button></div> : <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Paso {step} de 4 · {["Identificar el pago", "Validación del cobro", "Motivo del reclamo", "Confirmación"][step - 1]}</p>
      {step === 1 && <>
        <Label htmlFor="claim-folio">¿De qué pago me hablas?</Label>
        <Input id="claim-folio" value={folio} maxLength={22} placeholder="QRD-20261107-E50265" onChange={e => setFolio(e.target.value.toUpperCase())} />
        <Button disabled={busy || !/^QRD-\d{8}-[A-Z0-9]{6}$/.test(folio.trim())} onClick={() => void validate()}>Buscar folio</Button>
        {!admin && <div className="space-y-2"><h3 className="font-semibold text-sm">Pagos de los últimos 30 días</h3>{!payments.length && <p className="text-sm text-muted-foreground">Sin pagos disponibles.</p>}
          <div className="max-h-80 overflow-y-auto divide-y">{payments.map(p => <div key={p.movement_id} className="py-3 space-y-2">
            <p className="font-mono text-xs break-all">{p.original_folio}</p><p className="text-sm">{money(Number(p.amount))} · {formatHermosillo(p.created_at)} · {p.source_ambito === "sub_qr" ? "Familiar" : "Personal"}</p>
            <Button size="sm" variant="outline" disabled={busy || !withinRefundWindow(p.created_at, now)} onClick={() => void validate(p)}>Seleccionar pago</Button>
            {!withinRefundWindow(p.created_at, now) && <p className="text-xs text-muted-foreground">{refundExpiredMessage}</p>}
          </div>)}</div>
        </div>}
      </>}
      {step === 2 && <><p className="font-mono text-sm break-all">{payment?.original_folio}</p>{busy ? <p>Cotejando cobro original…</p> : context && !error && !eligibility && <><p>Pago identificado: {money(Number(context.original_amount))}.</p><Button disabled={admin && context.requests.length > 0} onClick={() => setStep(3)}>Continuar</Button></>}</>}
      {step === 3 && <>
        <Label htmlFor="claim-reason">Motivo del reclamo</Label><select id="claim-reason" className="w-full rounded-md border border-input bg-background p-2 text-sm" value={reason} onChange={e => setReason(e.target.value)}><option value="">Seleccionar motivo</option>{refundReasons.map(r => <option key={r}>{r}</option>)}</select>
        <Label htmlFor="claim-details">Detalles (opcional)</Label><Textarea id="claim-details" maxLength={450} value={details} onChange={e => setDetails(e.target.value)} />
        {admin && <><Label htmlFor="claim-override">Motivo obligatorio de la excepción</Label><Textarea id="claim-override" value={overrideReason} maxLength={500} onChange={e => setOverrideReason(e.target.value)} /><Label htmlFor="claim-amount">Monto a devolver</Label><Input id="claim-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></>}
        <Button disabled={!reason || validAmount === null || !!eligibility || (admin && overrideReason.trim().length < 3)} onClick={() => setStep(4)}>Continuar</Button>
      </>}
      {step === 4 && <><p className="text-sm break-words">Vas a {admin ? "autorizar" : "reclamar"} una devolución de {money(validAmount ?? 0)} del folio {payment?.original_folio} por motivo: {reason}.</p>{details && <p className="text-sm break-words">{details}</p>}{admin && <p className="text-sm break-words">Excepción registrada: {overrideReason}</p>}<Button disabled={busy || !!eligibility} onClick={() => void submit()}>{busy ? "Procesando…" : admin ? "Forzar devolución y registrar motivo" : "Enviar reclamación"}</Button></>}
      {step > 1 && <Button variant="outline" disabled={busy || !!payload.current} onClick={() => { setStep(step - 1); setError(""); }}>Volver</Button>}
      {(error || eligibility) && <p role="alert" className="text-sm text-destructive break-words">{error || eligibility}</p>}
    </div>}
    {!admin && <RefundRequests ambito="eje" allPersonal />}
  </section>;
}