import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Bus,
  FileText, Eye, DollarSign,
} from "lucide-react";

const DOC_LABELS: Record<string, string> = {
  ine: "INE",
  concesion: "Concesión IMTES",
  rfc: "RFC",
  domicilio: "Comprobante Domicilio",
  tarjeta_circulacion: "Tarjeta Circulación",
  fotos_unidades: "Fotos unidades",
};

type VerificacionAdmin = {
  id: string;
  estado: string;
  created_at: string;
  total_unidades: number;
  admin_notas: string | null;
  motivo_rechazo: string | null;
  concesionario_id: string;
  documentos?: Record<string, string[]>;
  metodo_envio?: string;
  proveedor_nombre?: string;
  proveedor_email?: string;
  cuenta_conectada_id?: string | null;
  unidades?: Array<{
    id: string;
    numero_economico: string;
    placas: string;
    modelo: string | null;
    linea: string | null;
    estado_verificacion: string | null;
  }>;
};

export default function AdminVerificaciones() {
  const [verificaciones, setVerificaciones] = useState<VerificacionAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [adminPhone, setAdminPhone] = useState("+52 662 412 4381");

  useEffect(() => {
    fetchVerificaciones();
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("telefono")
        .eq("consecutive_number", 1)
        .maybeSingle();
      if (data?.telefono) setAdminPhone(data.telefono);
    })();
  }, []);

  const fetchVerificaciones = async () => {
    try {
      const { data, error } = await (supabase
        .from("verificaciones_concesionario") as any)
        .select("id, estado, created_at, total_unidades, admin_notas, motivo_rechazo, concesionario_id, documentos, metodo_envio")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (v: any) => {
          const { data: prov } = await supabase
            .from("proveedores")
            .select("nombre, email")
            .eq("id", v.concesionario_id)
            .single();

          const { data: unidades } = await (supabase
            .from("detalles_verificacion_unidad") as any)
            .select("id, numero_economico, placas, modelo, linea, estado_verificacion")
            .eq("verificacion_id", v.id);

          const { data: cuenta } = await supabase
            .from("cuentas_conectadas")
            .select("id, pagos_habilitados, transferencias_habilitadas")
            .eq("concesionario_id", v.concesionario_id)
            .maybeSingle();

          return {
            ...v,
            proveedor_nombre: prov?.nombre || "—",
            proveedor_email: prov?.email || "—",
            unidades: unidades || [],
            cuenta_conectada_id: cuenta?.pagos_habilitados && cuenta?.transferencias_habilitadas ? cuenta.id : null,
          };
        })
      );

      setVerificaciones(enriched);
    } catch (err: any) {
      toast.error("Error al cargar verificaciones: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, newEstado: "approved" | "rejected") => {
    setProcessing(id);
    try {
      const updateData: any = {
        estado: newEstado,
        fecha_revision: new Date().toISOString(),
      };
      if (notas[id]) {
        if (newEstado === "rejected") {
          updateData.motivo_rechazo = notas[id];
        } else {
          updateData.admin_notas = notas[id];
        }
      }

      const { data: saved, error } = await (supabase
        .from("verificaciones_concesionario") as any)
        .update(updateData)
        .eq("id", id)
        .select("id, estado")
        .single();

      if (error) throw error;
      if (!saved || saved.estado !== newEstado) {
        throw new Error("La aprobación no se guardó. Verifica que estés entrando con la cuenta admin maestra.");
      }

      // Cascada: aprobar/rechazar todas las unidades vinculadas a esta verificación
      const unitEstado = newEstado === "approved" ? "approved" : "rejected";
      const { error: unitError } = await (supabase
        .from("detalles_verificacion_unidad") as any)
        .update({ estado_verificacion: unitEstado })
        .eq("verificacion_id", id);

      if (unitError) throw unitError;

      toast.success(newEstado === "approved" ? "Verificación aprobada — concesionario notificado en tiempo real" : "Verificación rechazada");
      fetchVerificaciones();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleViewDoc = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("verificacion-docs")
      .createSignedUrl(path, 60 * 5);
    if (error) {
      toast.error("No se pudo abrir: " + error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleTriggerSettlement = async (cuentaId: string, freq: string) => {
    setSettling(cuentaId);
    try {
      const { data, error } = await supabase.functions.invoke("process-daily-settlements", {
        body: { cuenta_id: cuentaId, frecuencia_liquidacion: freq },
      });
      if (error) throw error;
      if (data?.processed > 0) {
        const r = data.results?.[0];
        toast.success(`Liquidación: ${r?.boletos} boletos · Neto $${r?.neto} (${r?.estado})`);
      } else {
        toast.info("Sin boletos pendientes en el periodo");
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSettling(null);
    }
  };

  const estadoColor = (e: string) => {
    switch (e) {
      case "approved": return "bg-green-600 text-white";
      case "rejected": return "bg-destructive text-destructive-foreground";
      case "in_review": return "bg-amber-500 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const estadoLabel = (e: string) => {
    switch (e) {
      case "approved": return "Aprobado";
      case "rejected": return "Rechazado";
      case "in_review": return "En Revisión";
      case "pending": return "Pendiente";
      case "draft": return "Borrador";
      default: return e;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (verificaciones.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No hay solicitudes de verificación.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        Verificaciones de Concesionarios ({verificaciones.length})
      </h3>

      {verificaciones.map((v) => {
        const isExpanded = expandedId === v.id;
        const isPending = v.estado === "pending" || v.estado === "in_review";
        const docs = v.documentos || {};
        const docKeys = Object.keys(docs).filter((k) => (docs[k] || []).length > 0);

        return (
          <Card key={v.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{v.proveedor_nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{v.proveedor_email}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("es-MX")} · {v.unidades?.length || 0} unidades · {docKeys.length}/6 docs
                  {v.metodo_envio === "whatsapp" && " · 📱 WhatsApp"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={estadoColor(v.estado)}>{estadoLabel(v.estado)}</Badge>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3 border-t">
                {/* Aviso flujo WhatsApp */}
                {(v.metodo_envio === "whatsapp" || docKeys.length === 0) && isPending && (
                  <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      📱 Flujo de aprobación por WhatsApp
                    </p>
                    <ol className="text-xs text-blue-900 dark:text-blue-100 space-y-1 list-decimal list-inside">
                      <li>Revisa los documentos que el concesionario te envió a tu WhatsApp ({adminPhone}).</li>
                      <li>Verifica que estén completos: INE, Concesión, RFC, Domicilio, Tarjeta circulación, Fotos.</li>
                      <li>Si todo está bien, presiona <strong>Aprobar</strong> abajo (puedes anotar referencia del chat).</li>
                      <li>Si falta algo, presiona <strong>Rechazar</strong> indicando qué documento solicitar.</li>
                    </ol>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-2 italic">
                      Tras aprobar, el concesionario podrá conectar su cuenta Stripe y recibir liquidaciones automáticas.
                    </p>
                  </div>
                )}

                {/* Documentos */}
                <div className="space-y-2 pt-3">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Documentos subidos
                  </p>
                  {docKeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Sin documentos en la app. {v.metodo_envio === "whatsapp" ? "Revisa tu WhatsApp para ver los documentos." : "El concesionario aún no ha subido nada."}
                    </p>
                  ) : (
                    docKeys.map((k) => (
                      <div key={k} className="space-y-1">
                        <p className="text-xs font-medium text-foreground">
                          {DOC_LABELS[k] || k} ({(docs[k] || []).length})
                        </p>
                        <div className="space-y-1 pl-2">
                          {(docs[k] || []).map((path) => (
                            <button
                              key={path}
                              onClick={() => handleViewDoc(path)}
                              className="flex items-center gap-2 text-xs text-primary hover:underline w-full text-left"
                            >
                              <Eye className="h-3 w-3 shrink-0" />
                              <span className="truncate">{path.split("/").pop()}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Unidades */}
                {v.unidades && v.unidades.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Bus className="h-4 w-4" /> Unidades registradas
                    </p>
                    {v.unidades.map((u) => (
                      <div key={u.id} className="text-xs p-2 rounded bg-muted/50 flex justify-between">
                        <span>#{u.numero_economico} · {u.placas} · {u.linea || "—"} {u.modelo || ""}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {u.estado_verificacion === "approved" ? "✅" : u.estado_verificacion || "pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {v.admin_notas && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Notas admin:</strong> {v.admin_notas}
                  </p>
                )}
                {v.motivo_rechazo && (
                  <p className="text-xs text-destructive">
                    <strong>Motivo rechazo:</strong> {v.motivo_rechazo}
                  </p>
                )}

                {/* Action area */}
                {isPending && (
                  <div className="space-y-2 pt-2 border-t">
                    <Textarea
                      placeholder="Notas o motivo de rechazo (opcional)"
                      value={notas[v.id] || ""}
                      onChange={(e) => setNotas((prev) => ({ ...prev, [v.id]: e.target.value }))}
                      className="text-sm min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAction(v.id, "approved")}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={processing === v.id}
                      >
                        {processing === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Aprobar
                      </Button>
                      <Button
                        onClick={() => handleAction(v.id, "rejected")}
                        variant="destructive"
                        className="flex-1"
                        disabled={processing === v.id}
                      >
                        {processing === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                        Rechazar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Trigger manual de liquidación */}
                {v.estado === "approved" && v.cuenta_conectada_id && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-foreground">⚡ Disparar liquidación manual (admin)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["daily", "weekly", "monthly"] as const).map((freq) => (
                        <Button
                          key={freq}
                          size="sm"
                          variant="outline"
                          disabled={settling === v.cuenta_conectada_id}
                          onClick={() => handleTriggerSettlement(v.cuenta_conectada_id!, freq)}
                        >
                          {settling === v.cuenta_conectada_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <DollarSign className="h-3 w-3 mr-1" />
                          )}
                          {freq === "daily" ? "Día" : freq === "weekly" ? "Sem" : "Mes"}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
