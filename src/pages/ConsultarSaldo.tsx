import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet } from "lucide-react";

// Pantalla pública: solo lectura. Funciona al escanear el QR de "Consultar saldo" impreso.
export default function ConsultarSaldo() {
  const [params] = useSearchParams();
  const [codigo, setCodigo] = useState(params.get("k") ?? "");
  const [res, setRes] = useState<{ saldo: number; terminacion: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const consultar = async (k: string) => {
    let t = k.trim();
    const m = t.match(/[?&]k=([^&\s]+)/);
    if (m) t = decodeURIComponent(m[1]);
    if (!t) return;
    setBusy(true); setError(""); setRes(null);
    const { data, error } = await supabase.functions.invoke("qard-saldo-publico", { body: { action: "consultar", token: t } });
    setBusy(false);
    if (error || (data as any)?.error) setError("Este código no es válido. Escanea el QR de \"Consultar saldo\" de tu tarjeta impresa.");
    else setRes(data as any);
  };

  useEffect(() => { if (params.get("k")) consultar(params.get("k")!); }, []); // eslint-disable-line

  return (
    <div className="min-h-screen bg-background p-4 pb-40 flex flex-col items-center justify-center">
      <div className="w-full max-w-sm space-y-5 text-center">
        <Wallet className="h-10 w-10 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Consultar saldo QaRd</h1>
        {res ? (
          <div className="rounded-2xl border bg-card p-6 space-y-1">
            <div className="text-sm text-muted-foreground">Tarjeta terminación {res.terminacion}</div>
            <div className={`text-4xl font-bold ${res.saldo < 0 ? "text-destructive" : ""}`}>${res.saldo.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Solo consulta. No se puede gastar desde aquí.</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Escanea con la cámara el QR "Consultar saldo" de tu tarjeta impresa, o pega aquí su código.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2">
          <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código del QR de saldo" />
          <Button className="w-full" disabled={busy || !codigo.trim()} onClick={() => consultar(codigo)}>
            {busy ? "Consultando…" : "Consultar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
