import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Lock, Camera, ListOrdered, ArrowLeft, Unlock } from "lucide-react";
import { etiquetaMovimiento, type Ambito } from "@/lib/qardEtiquetas";
import { getHermosilloToday } from "@/lib/utils";

type Modo = "menu" | "saldo" | "bloquear";
type Mov = { id: string; tipo: string; monto_mxn: number; direccion: string | null; ambito: string | null; comercio_nombre: string | null; created_at: string };

const solo = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
const fmt16 = (d: string) => d.replace(/(\d{4})(?=\d)/g, "$1 ");
const haceDias = (n: number) => {
  const d = new Date(Date.now() - n * 86400_000 - 7 * 3600_000);
  return d.toISOString().slice(0, 10);
};

export default function ConsultarSaldo() {
  const [params] = useSearchParams();
  const [logueado, setLogueado] = useState<boolean | null>(null);
  const [modo, setModo] = useState<Modo>("menu");
  const [qard, setQard] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saldo, setSaldo] = useState<{ saldo: number; terminacion: string; estado: string; sub_id: string | null } | null>(null);
  const [movs, setMovs] = useState<Mov[] | null>(null);
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(() => { try { return getHermosilloToday(); } catch { return haceDias(0); } });
  const [bloqueada, setBloqueada] = useState<{ terminacion: string; sub_id: string | null } | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Tarjeta impresa antigua (?k=): consulta pública como antes
  const [legacy, setLegacy] = useState<{ saldo: number; terminacion: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogueado(!!data.session));
    const k = params.get("k");
    if (k) {
      supabase.functions.invoke("qard-saldo-publico", { body: { action: "consultar", token: k } })
        .then(({ data, error }) => { if (!error && !(data as any)?.error) setLegacy(data as any); });
    }
    return () => { detener(); };
  }, []); // eslint-disable-line

  const detener = async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch { /* */ }
    scannerRef.current = null;
    setEscaneando(false);
  };

  const escanear = async () => {
    setError("");
    setEscaneando(true);
    await new Promise(r => setTimeout(r, 50));
    const s = new Html5Qrcode("consulta-reader");
    scannerRef.current = s;
    try {
      await s.start({ facingMode: "environment" }, { fps: 10, qrbox: 230 }, (text) => {
        const d = String(text).replace(/\D/g, "");
        if (d.length === 16) { setQard(d); detener(); }
      }, () => {});
    } catch {
      setError("No se pudo abrir la cámara. Escribe los 16 dígitos.");
      setEscaneando(false);
    }
  };

  const llamar = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    const { data, error } = await supabase.functions.invoke("qard-consulta-cvv", { body: { action, qard_number: qard, cvv, ...extra } });
    setBusy(false);
    let msg = (data as any)?.error as string | undefined;
    if (error && !msg) {
      try { msg = (await (error as any).context?.json())?.error; } catch { /* */ }
    }
    if (error || msg) { setError(msg || "No se pudo completar en este momento; intenta de nuevo"); return null; }
    return data as any;
  };

  const consultar = async () => {
    const r = await llamar("saldo");
    if (r) { setSaldo(r); setMovs(null); }
  };
  const verMovs = async () => {
    const r = await llamar("movimientos", { desde, hasta });
    if (r) setMovs(r.movimientos);
  };
  const bloquear = async () => {
    if (!confirm(`¿Bloquear la QaRd terminación ${qard.slice(-4)}? Ya no podrá pagar hasta que el dueño la desbloquee.`)) return;
    const r = await llamar("bloquear");
    if (r) setBloqueada({ terminacion: r.terminacion, sub_id: r.sub_id });
  };
  const desbloquear = async (subId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("qard_sub_set_estado" as any, { _sub_qr_id: subId, _estado: "activa" });
    setBusy(false);
    if (error) return setError("No se pudo desbloquear; intenta de nuevo");
    setBloqueada(null);
    setSaldo(s => (s ? { ...s, estado: "activa" } : s));
  };

  const reiniciar = (m: Modo) => {
    detener(); setModo(m); setQard(""); setCvv(""); setError(""); setSaldo(null); setMovs(null); setBloqueada(null);
  };

  const listo = qard.length === 16 && cvv.length === 3;

  const camposTarjeta = (conCamara: boolean) => (
    <div className="space-y-3 text-left">
      {conCamara && (
        <>
          {escaneando ? (
            <div className="space-y-2">
              <div id="consulta-reader" className="rounded-xl overflow-hidden" />
              <Button variant="outline" className="w-full" onClick={detener}>Cancelar cámara</Button>
            </div>
          ) : (
            <Button className="w-full h-14 text-base" variant={qard.length === 16 ? "outline" : "default"} onClick={escanear}>
              <Camera className="h-5 w-5 mr-2" /> {qard.length === 16 ? "Volver a leer el QR" : "Leer el QR de la QaRd"}
            </Button>
          )}
        </>
      )}
      <div>
        <label className="text-sm text-muted-foreground">{conCamara ? "O escribe los 16 dígitos" : "Los 16 dígitos de la QaRd"}</label>
        <Input inputMode="numeric" value={fmt16(qard)} onChange={e => setQard(solo(e.target.value, 16))} placeholder="0000 0000 0000 0000" className="text-lg tracking-wider" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">CVV de 3 dígitos (el mismo de compras)</label>
        <Input inputMode="numeric" type="password" value={cvv} onChange={e => setCvv(solo(e.target.value, 3))} placeholder="•••" className="text-lg tracking-[0.5em] w-32" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 pb-40 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 text-center pt-6">
        {modo !== "menu" && (
          <button className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => reiniciar("menu")}>
            <ArrowLeft className="h-4 w-4" /> Regresar
          </button>
        )}

        {legacy && modo === "menu" && (
          <div className="rounded-2xl border bg-card p-5 space-y-1">
            <div className="text-sm text-muted-foreground">Tarjeta terminación {legacy.terminacion}</div>
            <div className={`text-4xl font-bold ${legacy.saldo < 0 ? "text-destructive" : ""}`}>${legacy.saldo.toFixed(2)}</div>
          </div>
        )}

        {modo === "menu" && (
          <>
            <Wallet className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Consultar y bloquear QaRd</h1>
            {logueado === false ? (
              <p className="text-sm text-muted-foreground">Inicia sesión en TodoCerca para consultar o bloquear una QaRd.</p>
            ) : (
              <div className="space-y-3">
                <button onClick={() => reiniciar("saldo")} className="w-full rounded-2xl border bg-card p-5 flex items-center gap-4 text-left hover:border-primary">
                  <Wallet className="h-8 w-8 text-primary shrink-0" />
                  <div><div className="font-semibold text-lg">Consultar saldo</div><div className="text-sm text-muted-foreground">Lee el QR y pon el CVV. Ves saldo y movimientos.</div></div>
                </button>
                <button onClick={() => reiniciar("bloquear")} className="w-full rounded-2xl border border-destructive/40 bg-card p-5 flex items-center gap-4 text-left hover:border-destructive">
                  <Lock className="h-8 w-8 text-destructive shrink-0" />
                  <div><div className="font-semibold text-lg">Bloquear QaRd</div><div className="text-sm text-muted-foreground">¿Se perdió? Escribe sus 16 dígitos y el CVV.</div></div>
                </button>
              </div>
            )}
          </>
        )}

        {modo === "saldo" && (
          <>
            <h1 className="text-2xl font-bold">Consultar saldo</h1>
            {!saldo ? (
              <>
                {camposTarjeta(true)}
                <Button className="w-full h-12" disabled={busy || !listo} onClick={consultar}>{busy ? "Consultando…" : "Ver saldo"}</Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card p-6 space-y-1">
                  <div className="text-sm text-muted-foreground">QaRd terminación {saldo.terminacion}</div>
                  <div className={`text-4xl font-bold ${saldo.saldo < 0 ? "text-destructive" : ""}`}>${saldo.saldo.toFixed(2)}</div>
                  {saldo.estado === "apagada" && <div className="text-sm font-semibold text-destructive">🔒 BLOQUEADA — no puede pagar</div>}
                  {saldo.estado === "apagada" && saldo.sub_id && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => desbloquear(saldo.sub_id!)}><Unlock className="h-4 w-4 mr-1" /> Desbloquear (es tuya)</Button>
                  )}
                </div>

                <div className="rounded-2xl border bg-card p-4 space-y-3 text-left">
                  <div className="flex items-center gap-2 font-semibold"><ListOrdered className="h-5 w-5" /> Movimientos</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-muted-foreground">Desde</label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground">Hasta</label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
                  </div>
                  <Button className="w-full" variant="secondary" disabled={busy} onClick={verMovs}>{busy ? "Buscando…" : "Ver movimientos"}</Button>
                  {movs && (movs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center">Sin movimientos en esas fechas.</p>
                  ) : (
                    <ul className="divide-y">
                      {movs.map(m => {
                        const entra = m.direccion === "in";
                        return (
                          <li key={m.id} className="py-2 flex justify-between gap-2 text-sm">
                            <div>
                              <div className="font-medium">{etiquetaMovimiento((m.ambito ?? "eje") as Ambito, m.tipo)}{m.comercio_nombre ? ` · ${m.comercio_nombre}` : ""}</div>
                              <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("es-MX", { timeZone: "America/Hermosillo", dateStyle: "short", timeStyle: "short" })}</div>
                            </div>
                            <div className={`font-semibold whitespace-nowrap ${entra ? "text-primary" : "text-destructive"}`}>{entra ? "+" : "−"}${Math.abs(Number(m.monto_mxn)).toFixed(2)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
                <Button variant="outline" className="w-full" onClick={() => reiniciar("saldo")}>Consultar otra QaRd</Button>
              </div>
            )}
          </>
        )}

        {modo === "bloquear" && (
          <>
            <Lock className="h-10 w-10 mx-auto text-destructive" />
            <h1 className="text-2xl font-bold">Bloquear QaRd</h1>
            {!bloqueada ? (
              <>
                <p className="text-sm text-muted-foreground">Al bloquearla nadie podrá pagar con ella. El saldo no se pierde. Al dueño le llega un aviso.</p>
                {camposTarjeta(false)}
                <Button variant="destructive" className="w-full h-12" disabled={busy || !listo} onClick={bloquear}>{busy ? "Bloqueando…" : "Bloquear ahora"}</Button>
              </>
            ) : (
              <div className="rounded-2xl border bg-card p-6 space-y-3">
                <div className="text-lg font-semibold">🔒 QaRd terminación {bloqueada.terminacion} bloqueada</div>
                <p className="text-sm text-muted-foreground">Ya no puede pagar. Su saldo sigue guardado.</p>
                {bloqueada.sub_id ? (
                  <Button variant="outline" disabled={busy} onClick={() => desbloquear(bloqueada.sub_id!)}><Unlock className="h-4 w-4 mr-1" /> Desbloquear (es tuya)</Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Solo el dueño puede desbloquearla desde su teléfono.</p>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
