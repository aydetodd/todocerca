import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Printer, Trash2, Wallet, ArrowDownToLine, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

type SubQR = {
  id: string;
  token: string;
  folio_corto: string;
  alias: string;
  saldo_mxn: number;
  total_gastado: number;
  estado: string;
  ultimo_uso_at: string | null;
  created_at: string;
};
type Wallet = {
  id: string;
  saldo_mxn: number;
  total_recargado: number;
  total_gastado: number;
  token: string;
  folio_corto: string;
};

const MIN_RECARGA = 200;

export default function WalletFamiliar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [subs, setSubs] = useState<SubQR[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [showRecargar, setShowRecargar] = useState(false);
  const [montoRecarga, setMontoRecarga] = useState("200");

  const [showCrear, setShowCrear] = useState(false);
  const [alias, setAlias] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("0");

  const [asignarTo, setAsignarTo] = useState<SubQR | null>(null);
  const [montoAsignar, setMontoAsignar] = useState("");

  const [cancelarTo, setCancelarTo] = useState<SubQR | null>(null);
  const [verQR, setVerQR] = useState<SubQR | null>(null);
  const [verEjeQR, setVerEjeQR] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    load();
  }, [user]);

  useEffect(() => {
    const r = params.get("recarga");
    if (r === "success") {
      const m = params.get("monto");
      toast.success(`Recarga exitosa: $${m} MXN. Aparecerá en segundos.`);
      setTimeout(load, 2500);
    } else if (r === "cancelled") {
      toast.info("Recarga cancelada");
    }
  }, [params]);

  // Realtime: cambios en wallet/sub_qr/movimientos
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`wallet-fam-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets_qr", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "sub_qr_saldo", filter: `titular_user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-familiar", {
        body: { action: "ensure_wallet" },
      });
      if (error) throw error;
      setWallet(data.wallet);
      setSubs(data.sub_qrs || []);
    } catch (e: any) {
      toast.error(e.message || "Error cargando wallet");
    } finally {
      setLoading(false);
    }
  };

  const recargar = async () => {
    const m = Number(montoRecarga);
    if (!m || m < MIN_RECARGA) {
      toast.error(`Mínimo $${MIN_RECARGA} MXN`);
      return;
    }
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-familiar", {
        body: { action: "recargar", monto_mxn: m },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Error al iniciar recarga");
    } finally {
      setWorking(false);
    }
  };

  const crearSub = async () => {
    if (!alias.trim()) { toast.error("Pon un nombre/alias"); return; }
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-familiar", {
        body: {
          action: "crear_sub_qr",
          alias: alias.trim(),
          saldo_inicial: Number(saldoInicial) || 0,
        },
      });
      if (error) throw error;
      toast.success(`QR creado para ${alias}`);
      setShowCrear(false);
      setAlias(""); setSaldoInicial("0");
      await load();
      setVerQR(data.sub_qr);
    } catch (e: any) {
      toast.error(e.message || "Error al crear");
    } finally {
      setWorking(false);
    }
  };

  const asignar = async () => {
    if (!asignarTo) return;
    const m = Number(montoAsignar);
    if (!m || m <= 0) { toast.error("Monto inválido"); return; }
    setWorking(true);
    try {
      const { error } = await supabase.functions.invoke("wallet-familiar", {
        body: { action: "asignar_saldo", sub_qr_id: asignarTo.id, monto_mxn: m },
      });
      if (error) throw error;
      toast.success(`Recargado +$${m.toFixed(2)} a ${asignarTo.alias}`);
      setAsignarTo(null); setMontoAsignar("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setWorking(false);
    }
  };

  const cancelar = async () => {
    if (!cancelarTo) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-familiar", {
        body: { action: "cancelar_sub_qr", sub_qr_id: cancelarTo.id },
      });
      if (error) throw error;
      toast.success(`QR cancelado. $${Number(data.saldo_devuelto).toFixed(2)} regresó al wallet.`);
      setCancelarTo(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setWorking(false);
    }
  };

  const imprimirQR = (sub: SubQR) => {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) { toast.error("Permite ventanas emergentes para imprimir"); return; }
    const svgEl = document.getElementById(`qr-${sub.id}`)?.querySelector("svg");
    const svgStr = svgEl ? new XMLSerializer().serializeToString(svgEl) : "";
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${sub.alias}</title>
      <style>
        body{font-family:system-ui;text-align:center;padding:40px;}
        .card{border:3px solid #000;border-radius:16px;padding:32px;max-width:420px;margin:0 auto;}
        h1{margin:0 0 8px;font-size:28px;}
        .folio{font-size:28px;font-weight:700;letter-spacing:2px;font-family:monospace;margin:16px 0;}
        .alias{font-size:22px;font-weight:600;margin:8px 0;}
        .footer{margin-top:24px;font-size:12px;color:#444;}
        svg{width:280px;height:280px;}
      </style></head><body>
      <div class="card">
        <h1>TodoCerca · Wallet QR</h1>
        <div class="alias">${sub.alias}</div>
        ${svgStr}
        <div class="folio">${sub.folio_corto}</div>
        <div class="footer">Muestra este QR al chofer para pagar tu pasaje.<br/>
        Si lo pierdes, el titular puede cancelarlo desde la app.</div>
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    w.document.close();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Cargando wallet…</p>
      </div>
    );
  }

  const saldo = Number(wallet?.saldo_mxn || 0);
  const activos = subs.filter(s => s.estado === "activo");
  const cancelados = subs.filter(s => s.estado !== "activo");

  return (
    <div className="min-h-screen bg-background pb-40">
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold">Wallet Familiar QR</h1>
            <p className="text-xs text-muted-foreground">QR de saldo recargable para tu familia</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Saldo del titular */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" /> Saldo disponible
            </div>
            <p className="text-4xl font-bold text-foreground">${saldo.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Recargado: ${Number(wallet?.total_recargado || 0).toFixed(2)} · Gastado: ${Number(wallet?.total_gastado || 0).toFixed(2)}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button onClick={() => setShowRecargar(true)}>
                <ArrowDownToLine className="h-4 w-4 mr-1" /> Recargar
              </Button>
              <Button variant="secondary" onClick={() => setVerEjeQR(true)}>
                Mi QR
              </Button>
              <Button variant="outline" onClick={() => setShowCrear(true)}>
                <Plus className="h-4 w-4 mr-1" /> Crear QR
              </Button>
            </div>
            {wallet?.folio_corto && (
              <p className="text-[11px] font-mono text-center text-muted-foreground mt-2">
                Tu QR eje: <strong>{wallet.folio_corto}</strong> — cobra de este saldo directo
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lista activos */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> QR de familia ({activos.length})
          </h2>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {activos.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no creas QR de familia. Toca <strong className="text-foreground">"Crear QR"</strong> arriba.
          </CardContent></Card>
        )}

        {activos.map(sub => (
          <Card key={sub.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-lg">{sub.alias}</p>
                  <p className="text-xs font-mono text-muted-foreground">{sub.folio_corto}</p>
                </div>
                <Badge variant="default">Activo</Badge>
              </div>
              <div className="flex items-baseline gap-3">
                <p className="text-2xl font-bold text-primary">${Number(sub.saldo_mxn).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">gastado ${Number(sub.total_gastado).toFixed(2)}</p>
              </div>
              {sub.ultimo_uso_at && (
                <p className="text-xs text-muted-foreground">
                  Último uso: {new Date(sub.ultimo_uso_at).toLocaleString("es-MX", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                </p>
              )}
              <div className="grid grid-cols-4 gap-1 pt-2">
                <Button size="sm" variant="outline" onClick={() => setVerQR(sub)}>Ver QR</Button>
                <Button size="sm" variant="outline" onClick={() => imprimirQR(sub)}>
                  <Printer className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAsignarTo(sub); setMontoAsignar(""); }}>
                  <Plus className="h-3 w-3" /> Saldo
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setCancelarTo(sub)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {cancelados.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-muted-foreground mt-6">Cancelados</h3>
            {cancelados.map(s => (
              <Card key={s.id} className="opacity-60">
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{s.alias}</p>
                    <p className="text-xs font-mono text-muted-foreground">{s.folio_corto}</p>
                  </div>
                  <Badge variant="destructive">Cancelado</Badge>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p>• Recarga mínima: <strong className="text-foreground">${MIN_RECARGA} MXN</strong></p>
            <p>• Cada QR es <strong className="text-foreground">imprimible y enmicable</strong> para quien no tiene celular</p>
            <p>• Si lo pierdes, cancélalo: el saldo regresa <strong className="text-foreground">siempre al titular</strong></p>
            <p>• Antifraude: mismo QR no puede usarse dos veces en menos de <strong className="text-foreground">3 minutos</strong></p>
            <p>• Recibes una notificación cada vez que se use uno de tus QR</p>
          </CardContent>
        </Card>
      </div>

      {/* QR oculto para impresión (uno por sub) */}
      <div className="hidden">
        {subs.map(s => (
          <div key={s.id} id={`qr-${s.id}`}>
            <QRCodeSVG value={s.token} size={280} level="H" includeMargin />
          </div>
        ))}
      </div>

      {/* Dialog Recargar */}
      <Dialog open={showRecargar} onOpenChange={setShowRecargar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recargar wallet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Monto (MXN) — mínimo ${MIN_RECARGA}</Label>
            <Input type="number" inputMode="numeric" value={montoRecarga}
              onChange={e => setMontoRecarga(e.target.value)} min={MIN_RECARGA} />
            <div className="grid grid-cols-4 gap-1">
              {[200, 500, 1000, 2000].map(v => (
                <Button key={v} size="sm" variant="outline" onClick={() => setMontoRecarga(String(v))}>
                  ${v}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRecargar(false)}>Cancelar</Button>
            <Button onClick={recargar} disabled={working}>
              {working ? "..." : "Pagar con Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Crear sub-QR */}
      <Dialog open={showCrear} onOpenChange={setShowCrear}>
        <DialogContent>
          <DialogHeader><DialogTitle>Crear nuevo QR</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre / alias</Label>
              <Input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Mamá, Papá, Hijo..." />
            </div>
            <div>
              <Label>Saldo a asignar (de tu wallet ${saldo.toFixed(2)})</Label>
              <Input type="number" inputMode="decimal" value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Puedes dejar 0 y recargar después.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCrear(false)}>Cancelar</Button>
            <Button onClick={crearSub} disabled={working}>{working ? "..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Asignar saldo */}
      <Dialog open={!!asignarTo} onOpenChange={(o) => !o && setAsignarTo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recargar saldo a {asignarTo?.alias}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Saldo actual de este QR: <strong>${Number(asignarTo?.saldo_mxn||0).toFixed(2)}</strong></p>
            <p className="text-sm">Disponible en tu wallet: <strong>${saldo.toFixed(2)}</strong></p>
            <Label>Monto a transferir</Label>
            <Input type="number" inputMode="decimal" value={montoAsignar}
              onChange={e => setMontoAsignar(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsignarTo(null)}>Cancelar</Button>
            <Button onClick={asignar} disabled={working}>{working ? "..." : "Transferir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ver QR grande */}
      <Dialog open={!!verQR} onOpenChange={(o) => !o && setVerQR(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{verQR?.alias} · {verQR?.folio_corto}</DialogTitle></DialogHeader>
          {verQR && (
            <div className="text-center space-y-3">
              <div className="bg-white p-4 rounded-xl inline-block">
                <QRCodeSVG value={verQR.token} size={240} level="H" includeMargin />
              </div>
              <p className="text-2xl font-bold text-primary">${Number(verQR.saldo_mxn).toFixed(2)}</p>
              <Button onClick={() => imprimirQR(verQR)} className="w-full">
                <Printer className="h-4 w-4 mr-2" /> Imprimir para enmicar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Ver QR EJE (cuenta titular) */}
      <Dialog open={verEjeQR} onOpenChange={setVerEjeQR}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mi QR — Cuenta Eje</DialogTitle></DialogHeader>
          {wallet && (
            <div className="text-center space-y-3">
              <div className="bg-white p-4 rounded-xl inline-block">
                <QRCodeSVG id="qr-eje-svg" value={wallet.token} size={240} level="H" includeMargin />
              </div>
              <p className="font-mono text-lg">{wallet.folio_corto}</p>
              <p className="text-2xl font-bold text-primary">${saldo.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                Este QR cobra <strong>directo de tu saldo principal</strong>. Úsalo tú o imprímelo para ti.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  const win = window.open("", "_blank", "width=600,height=800");
                  if (!win) { toast.error("Permite ventanas emergentes"); return; }
                  const svg = document.getElementById("qr-eje-svg");
                  const svgStr = svg ? new XMLSerializer().serializeToString(svg) : "";
                  win.document.write(`<!DOCTYPE html><html><head><title>QR Eje</title>
                    <style>body{font-family:system-ui;text-align:center;padding:40px;}
                    .card{border:3px solid #000;border-radius:16px;padding:32px;max-width:420px;margin:0 auto;}
                    .folio{font-size:28px;font-weight:700;letter-spacing:2px;font-family:monospace;margin:16px 0;}
                    svg{width:280px;height:280px;}</style></head><body>
                    <div class="card">
                      <h1>TodoCerca · QR Eje</h1>
                      ${svgStr}
                      <div class="folio">${wallet.folio_corto}</div>
                      <div>Paga directo del saldo principal</div>
                    </div>
                    <script>window.onload=()=>window.print();</script></body></html>`);
                  win.document.close();
                }}
              >
                <Printer className="h-4 w-4 mr-2" /> Imprimir para enmicar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Confirm cancelar */}
      <AlertDialog open={!!cancelarTo} onOpenChange={(o) => !o && setCancelarTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar QR de {cancelarTo?.alias}?</AlertDialogTitle>
            <AlertDialogDescription>
              El saldo restante de <strong>${Number(cancelarTo?.saldo_mxn||0).toFixed(2)}</strong> regresará a tu wallet.
              El QR físico dejará de funcionar inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={cancelar} disabled={working}>Sí, cancelar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
