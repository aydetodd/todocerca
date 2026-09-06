import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Copy, Landmark, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatHermosillo } from "@/lib/utils";

type Referencia = {
  clabe_maestra: string | null;
  beneficiario: string;
  qard_number: string;
  concepto: string;
  pendiente_configuracion: boolean;
  limite: { tope: number | null; usado: number; disponible: number | null };
};

type Deposito = {
  id: string;
  monto_mxn: number;
  concepto: string | null;
  clave_rastreo: string | null;
  ordenante_nombre: string | null;
  estado: string;
  motivo_rechazo: string | null;
  created_at: string;
};

const ESTADO_DEP: Record<string, { label: string; cls: string }> = {
  acreditado: { label: "Acreditado", cls: "text-emerald-600" },
  rechazado: { label: "Rechazado", cls: "text-destructive" },
  sin_qard: { label: "En revisión", cls: "text-amber-600" },
  pendiente: { label: "Pendiente", cls: "text-muted-foreground" },
};

function formatNumero(n?: string | null) {
  if (!n) return "---- ---- ---- ----";
  return `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8, 12)} ${n.slice(12, 16)}`;
}

export default function QardRecargar() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState<Referencia | null>(null);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke("stp-referencia", { body: {} });
    if (fnErr || data?.error) {
      setError(data?.error || fnErr?.message || "No se pudieron cargar los datos de recarga.");
      setRef(null);
    } else {
      setRef(data as Referencia);
    }
    const { data: deps } = await supabase
      .from("stp_depositos")
      .select("id, monto_mxn, concepto, clave_rastreo, ordenante_nombre, estado, motivo_rechazo, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setDepositos((deps as Deposito[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const copiar = async (texto: string, etiqueta: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: `${etiqueta} copiado` });
    } catch {
      toast({ title: "No se pudo copiar", description: texto, variant: "destructive" });
    }
  };

  const lim = ref?.limite;

  return (
    <div className="min-h-screen bg-background pb-40">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => nav("/qard")} aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">Recargar por transferencia</h1>
        </div>

        {loading && <div className="text-sm text-muted-foreground text-center py-10">Cargando…</div>}

        {!loading && error && (
          <Card className="p-4 space-y-3">
            <div className="text-sm text-destructive">{error}</div>
            <Button variant="outline" onClick={cargar}>
              <RefreshCw className="h-4 w-4 mr-2" /> Reintentar
            </Button>
          </Card>
        )}

        {!loading && ref && (
          <>
            {ref.pendiente_configuracion ? (
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">
                  Las recargas por transferencia aún no están disponibles. Muy pronto podrás recargar tu QaRd con SPEI.
                </div>
              </Card>
            ) : (
              <>
                <Card className="p-4 space-y-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <Landmark className="h-5 w-5 text-primary" /> Transfiere desde tu banco (SPEI)
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">CLABE destino</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-lg tracking-wider break-all">{ref.clabe_maestra}</div>
                      <Button variant="outline" size="sm" onClick={() => copiar(ref.clabe_maestra!, "CLABE")}>
                        <Copy className="h-4 w-4 mr-1" /> Copiar
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Beneficiario</div>
                    <div className="font-medium">{ref.beneficiario}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Concepto / referencia (obligatorio)</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-base break-all">{ref.concepto}</div>
                      <Button variant="outline" size="sm" onClick={() => copiar(ref.concepto, "Concepto")}>
                        <Copy className="h-4 w-4 mr-1" /> Copiar
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Sin este concepto no podemos saber que el dinero es tuyo. Cópialo tal cual en tu app bancaria.
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 pt-2">
                    <div className="bg-white p-3 rounded-xl border">
                      <QRCodeSVG
                        value={`CLABE:${ref.clabe_maestra}|BENEFICIARIO:${ref.beneficiario}|CONCEPTO:${ref.concepto}`}
                        size={180}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground text-center">
                      Escanea este código si tu banco lo permite, o copia los datos de arriba.
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Tu QaRd (donde cae el dinero)</div>
                  <div className="font-mono text-base">{formatNumero(ref.qard_number)}</div>
                </Card>

                {lim && lim.tope !== null && (
                  <Card className="p-4">
                    <div className="font-semibold mb-2 text-sm">Tu límite de entradas este mes</div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, (lim.usado / lim.tope) * 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Has recibido ${lim.usado.toFixed(2)} de ${lim.tope.toFixed(2)}.
                      Te quedan ${(lim.disponible ?? 0).toFixed(2)} disponibles. El día 1 se reinicia.
                    </div>
                  </Card>
                )}
                {lim && lim.tope === null && (
                  <Card className="p-4">
                    <div className="text-xs text-sky-700 font-medium">Cuenta Comerciante: entradas sin tope mensual.</div>
                  </Card>
                )}
              </>
            )}

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">Mis recargas por transferencia</div>
                <Button variant="ghost" size="icon" onClick={cargar} aria-label="Actualizar">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {depositos.length === 0 && (
                <div className="text-xs text-muted-foreground">Aún no tienes recargas por transferencia.</div>
              )}
              <div className="space-y-2">
                {depositos.map(d => {
                  const est = ESTADO_DEP[d.estado] ?? ESTADO_DEP.pendiente;
                  return (
                    <div key={d.id} className="flex items-start justify-between gap-2 border-b last:border-0 pb-2">
                      <div className="min-w-0">
                        <div className={`text-xs font-medium ${est.cls}`}>{est.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {formatHermosillo(d.created_at)}
                          {d.ordenante_nombre ? ` · ${d.ordenante_nombre}` : ""}
                        </div>
                        {d.clave_rastreo && (
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            Rastreo: {d.clave_rastreo}
                          </div>
                        )}
                        {d.estado === "rechazado" && d.motivo_rechazo && (
                          <div className="text-[11px] text-destructive">{d.motivo_rechazo}</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold whitespace-nowrap">${d.monto_mxn.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
