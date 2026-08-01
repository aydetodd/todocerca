import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Receipt, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Servicio = {
  id: string;
  slug: string;
  nombre: string;
  categoria: string;
  icono: string;
  referencia_label: string;
  referencia_min_len: number;
  referencia_max_len: number;
  monto_min_mxn: number;
  monto_max_mxn: number;
  comision_fija_mxn: number;
};

type Pago = {
  id: string;
  servicio_nombre: string;
  referencia: string;
  monto_mxn: number;
  comision_mxn: number;
  total_mxn: number;
  estado: string;
  created_at: string;
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente_envio: "En proceso",
  enviado: "Enviado",
  pagado: "Pagado",
  reversado: "Devuelto",
};

export default function QardServicios() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [servicioId, setServicioId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const servicio = useMemo(
    () => servicios.find((s) => s.id === servicioId) || null,
    [servicios, servicioId]
  );
  const montoNum = Number(monto) || 0;
  const comision = servicio ? Number(servicio.comision_fija_mxn) : 0;
  const total = montoNum > 0 ? montoNum + comision : 0;

  const cargar = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      nav("/auth");
      return;
    }
    const [srv, wal, pag] = await Promise.all([
      supabase
        .from("qard_servicios_catalogo")
        .select("*")
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase.from("qard_wallets").select("saldo_mxn").eq("titular_user_id", uid).maybeSingle(),
      supabase
        .from("qard_pagos_servicio")
        .select("id, servicio_nombre, referencia, monto_mxn, comision_mxn, total_mxn, estado, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setServicios((srv.data as Servicio[]) || []);
    setSaldo(Number(wal.data?.saldo_mxn ?? 0));
    setPagos((pag.data as Pago[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pagar = async () => {
    if (!servicio) return toast({ title: "Elige un servicio", variant: "destructive" });
    const ref = referencia.trim();
    if (ref.length < servicio.referencia_min_len || ref.length > servicio.referencia_max_len) {
      return toast({
        title: "Referencia incorrecta",
        description: `Debe tener entre ${servicio.referencia_min_len} y ${servicio.referencia_max_len} caracteres.`,
        variant: "destructive",
      });
    }
    if (montoNum < Number(servicio.monto_min_mxn) || montoNum > Number(servicio.monto_max_mxn)) {
      return toast({
        title: "Monto fuera de rango",
        description: `Entre $${servicio.monto_min_mxn} y $${servicio.monto_max_mxn}.`,
        variant: "destructive",
      });
    }
    if (total > saldo) {
      return toast({
        title: "Saldo insuficiente",
        description: `Tienes $${saldo.toFixed(2)} y necesitas $${total.toFixed(2)}.`,
        variant: "destructive",
      });
    }

    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("qard-pagar-servicio", {
        body: {
          servicio_id: servicio.id,
          referencia: ref,
          monto_mxn: montoNum,
          idempotency_key: crypto.randomUUID(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Pago realizado",
        description: `${servicio.nombre} · $${total.toFixed(2)} (incluye $${comision.toFixed(2)} de comisión).`,
      });
      setReferencia("");
      setMonto("");
      await cargar();
    } catch (e: any) {
      toast({
        title: "No se pudo pagar",
        description: e?.message || "Intenta de nuevo",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-40 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav("/qard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Pagar servicios</h1>
      </div>

      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Saldo disponible en tu QaRd</div>
        <div className="text-3xl font-bold text-primary">${saldo.toFixed(2)}</div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div className="font-semibold">¿Qué vas a pagar?</div>

            <div className="grid grid-cols-2 gap-2">
              {servicios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServicioId(s.id);
                    setReferencia("");
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    servicioId === s.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <div className="text-2xl">{s.icono}</div>
                  <div className="text-sm font-medium leading-tight">{s.nombre}</div>
                </button>
              ))}
            </div>

            {servicio && (
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-xs">{servicio.referencia_label}</Label>
                  <Input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    inputMode="numeric"
                    maxLength={servicio.referencia_max_len}
                  />
                </div>
                <div>
                  <Label className="text-xs">Monto a pagar</Label>
                  <Input
                    type="number"
                    min={servicio.monto_min_mxn}
                    max={servicio.monto_max_mxn}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                  />
                </div>

                <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Monto del recibo</span>
                    <span>${montoNum.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Comisión TodoCerca</span>
                    <span>${comision.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-border pt-1">
                    <span>Total a descontar</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <Button className="w-full" onClick={pagar} disabled={enviando || total <= 0}>
                  {enviando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4 mr-2" />
                  )}
                  Pagar ${total.toFixed(2)}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="font-semibold mb-2">Mis pagos recientes</div>
            {pagos.length === 0 ? (
              <div className="text-sm text-muted-foreground">Todavía no has pagado ningún servicio.</div>
            ) : (
              <div className="divide-y divide-border">
                {pagos.map((p) => (
                  <div key={p.id} className="py-2 flex justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.servicio_nombre}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Ref {p.referencia} ·{" "}
                        {new Date(p.created_at).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">${Number(p.total_mxn).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        {ESTADO_LABEL[p.estado] ?? p.estado}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
