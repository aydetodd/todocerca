import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Bus } from "lucide-react";

type VerificacionAdmin = {
  id: string;
  estado: string;
  created_at: string;
  total_unidades: number;
  admin_notas: string | null;
  motivo_rechazo: string | null;
  concesionario_id: string;
  proveedor_nombre?: string;
  proveedor_email?: string;
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

  useEffect(() => {
    fetchVerificaciones();
  }, []);

  const fetchVerificaciones = async () => {
    try {
      const { data, error } = await (supabase
        .from("verificaciones_concesionario") as any)
        .select("id, estado, created_at, total_unidades, admin_notas, motivo_rechazo, concesionario_id")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch proveedor info for each
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

          return {
            ...v,
            proveedor_nombre: prov?.nombre || "—",
            proveedor_email: prov?.email || "—",
            unidades: unidades || [],
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

      const { error } = await (supabase
        .from("verificaciones_concesionario") as any)
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success(newEstado === "approved" ? "Verificación aprobada" : "Verificación rechazada");
      fetchVerificaciones();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setProcessing(null);
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

        return (
          <Card key={v.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{v.proveedor_nombre}</p>
                <p className="text-xs text-muted-foreground">{v.proveedor_email}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("es-MX")} · {v.unidades?.length || 0} unidades
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={estadoColor(v.estado)}>{estadoLabel(v.estado)}</Badge>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3 border-t">
                {/* Unidades */}
                {v.unidades && v.unidades.length > 0 && (
                  <div className="space-y-2">
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

                {/* Admin notes / rejection reason */}
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
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
