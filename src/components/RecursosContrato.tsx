import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bus, Users, MapPin, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Plus, RefreshCw, Loader2, Shield,
} from "lucide-react";

type Recurso = {
  id: string;
  contrato_id: string;
  tipo_recurso: string;
  recurso_id: string;
  nombre_recurso: string;
  detalle: string | null;
  estado: string;
  solicitado_por: string;
  aprobado_por: string | null;
  created_at: string;
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  unidad: <Bus className="h-3.5 w-3.5" />,
  chofer: <Users className="h-3.5 w-3.5" />,
  ruta: <MapPin className="h-3.5 w-3.5" />,
};

const TIPO_LABELS: Record<string, string> = {
  unidad: "Unidad",
  chofer: "Chofer",
  ruta: "Ruta",
};

const ESTADO_BADGE: Record<string, { variant: "default" | "destructive" | "secondary"; label: string }> = {
  pendiente: { variant: "secondary", label: "Pendiente" },
  aprobado: { variant: "default", label: "Aprobado" },
  rechazado: { variant: "destructive", label: "Rechazado" },
};

interface RecursosContratoProps {
  contratoId: string;
  proveedorId: string;
  rol: "concesionario" | "empresa";
  userId: string;
}

export default function RecursosContrato({ contratoId, proveedorId, rol, userId }: RecursosContratoProps) {
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tipoAdd, setTipoAdd] = useState("unidad");
  const [availableItems, setAvailableItems] = useState<{ id: string; label: string; detail?: string }[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRecursos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("recursos_contrato")
      .select("*")
      .eq("contrato_id", contratoId)
      .order("created_at", { ascending: false });
    setRecursos((data || []) as Recurso[]);
    setLoading(false);
  };

  useEffect(() => {
    if (expanded) loadRecursos();
  }, [expanded, contratoId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`recursos-contrato-${contratoId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "recursos_contrato",
        filter: `contrato_id=eq.${contratoId}`,
      }, () => loadRecursos())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contratoId]);

  const loadAvailable = async (tipo: string) => {
    setAvailableItems([]);
    setSelectedItem("");

    // Get already assigned resource IDs for this type
    const { data: existing } = await supabase
      .from("recursos_contrato")
      .select("recurso_id")
      .eq("contrato_id", contratoId)
      .eq("tipo_recurso", tipo)
      .neq("estado", "rechazado");
    const existingIds = new Set((existing || []).map(e => e.recurso_id));

    if (tipo === "unidad") {
      const { data } = await supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas, transport_type")
        .eq("proveedor_id", proveedorId)
        .eq("transport_type", "privado");
      setAvailableItems(
        (data || [])
          .filter(u => !existingIds.has(u.id))
          .map(u => ({
            id: u.id,
            label: `${u.nombre || u.numero_economico} - ${u.placas || "Sin placas"}`,
            detail: u.numero_economico,
          }))
      );
    } else if (tipo === "chofer") {
      const { data } = await supabase
        .from("choferes_empresa")
        .select("id, nombre, telefono")
        .eq("proveedor_id", proveedorId)
        .eq("is_active", true);
      setAvailableItems(
        (data || [])
          .filter(c => !existingIds.has(c.id))
          .map(c => ({
            id: c.id,
            label: c.nombre || c.telefono,
            detail: c.telefono,
          }))
      );
    } else if (tipo === "ruta") {
      const { data } = await supabase
        .from("productos")
        .select("id, nombre")
        .eq("proveedor_id", proveedorId)
        .eq("is_mobile", true)
        .eq("route_type", "privada");
      setAvailableItems(
        (data || [])
          .filter(r => !existingIds.has(r.id))
          .map(r => ({
            id: r.id,
            label: r.nombre,
          }))
      );
    }
  };

  useEffect(() => {
    if (showAdd) loadAvailable(tipoAdd);
  }, [showAdd, tipoAdd]);

  const handleAdd = async () => {
    if (!selectedItem) return;
    const item = availableItems.find(i => i.id === selectedItem);
    if (!item) return;
    setSaving(true);
    await supabase.from("recursos_contrato").insert({
      contrato_id: contratoId,
      tipo_recurso: tipoAdd,
      recurso_id: selectedItem,
      nombre_recurso: item.label,
      detalle: item.detail || null,
      solicitado_por: userId,
      estado: "pendiente",
    });
    setSaving(false);
    setSelectedItem("");
    setShowAdd(false);
    loadRecursos();
  };

  const handleApprove = async (id: string) => {
    await supabase
      .from("recursos_contrato")
      .update({ estado: "aprobado", aprobado_por: userId })
      .eq("id", id);
  };

  const handleReject = async (id: string) => {
    await supabase
      .from("recursos_contrato")
      .update({ estado: "rechazado", aprobado_por: userId })
      .eq("id", id);
  };

  const handleResend = async (id: string) => {
    await supabase
      .from("recursos_contrato")
      .update({ estado: "pendiente", aprobado_por: null })
      .eq("id", id);
  };

  const pendingCount = recursos.filter(r => r.estado === "pendiente").length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Shield className="h-3.5 w-3.5" />
        Recursos autorizados
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4">
            {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
          </Badge>
        )}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Concesionario: botón para agregar */}
          {rol === "concesionario" && (
            <>
              {!showAdd ? (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowAdd(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Asignar recurso
                </Button>
              ) : (
                <div className="p-2 border rounded-md space-y-2 bg-muted/30">
                  <div className="flex gap-1.5">
                    <Select value={tipoAdd} onValueChange={v => { setTipoAdd(v); setSelectedItem(""); }}>
                      <SelectTrigger className="w-[100px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unidad" className="text-xs">Unidad</SelectItem>
                        <SelectItem value="chofer" className="text-xs">Chofer</SelectItem>
                        <SelectItem value="ruta" className="text-xs">Ruta</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={selectedItem} onValueChange={setSelectedItem}>
                      <SelectTrigger className="flex-1 h-7 text-xs">
                        <SelectValue placeholder={`Seleccionar ${TIPO_LABELS[tipoAdd].toLowerCase()}...`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableItems.length === 0 && (
                          <SelectItem value="_none" disabled className="text-xs">Sin {TIPO_LABELS[tipoAdd].toLowerCase()}s disponibles</SelectItem>
                        )}
                        {availableItems.map(item => (
                          <SelectItem key={item.id} value={item.id} className="text-xs">{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="text-xs h-7" onClick={handleAdd} disabled={saving || !selectedItem}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enviar a aprobación"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAdd(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Lista de recursos */}
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : recursos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {rol === "concesionario" ? "Asigna unidades, choferes o rutas para que la empresa los autorice" : "Sin recursos asignados por el concesionario"}
            </p>
          ) : (
            <div className="space-y-1">
              {["pendiente", "aprobado", "rechazado"].map(estado => {
                const items = recursos.filter(r => r.estado === estado);
                if (items.length === 0) return null;
                return (
                  <div key={estado}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 mb-0.5">
                      {ESTADO_BADGE[estado].label} ({items.length})
                    </p>
                    {items.map(r => (
                      <div key={r.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30 mb-1">
                        {TIPO_ICONS[r.tipo_recurso]}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{r.nombre_recurso}</p>
                          {r.detalle && <p className="text-[10px] text-muted-foreground">{r.detalle}</p>}
                        </div>
                        <Badge variant={ESTADO_BADGE[r.estado].variant} className="text-[10px] px-1.5 h-4">
                          {TIPO_LABELS[r.tipo_recurso]}
                        </Badge>

                        {/* Empresa: aprobar/rechazar pendientes */}
                        {rol === "empresa" && r.estado === "pendiente" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleApprove(r.id)}>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleReject(r.id)}>
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        )}

                        {/* Concesionario: reenviar rechazados */}
                        {rol === "concesionario" && r.estado === "rechazado" && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => handleResend(r.id)}>
                            <RefreshCw className="h-3 w-3 mr-0.5" />
                            <span className="text-[10px]">Reenviar</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
