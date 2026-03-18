import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, FileText, DollarSign, AlertTriangle, Bus, TrendingUp,
  Clock, CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp, BarChart3,
  Users, Plus, MessageCircle, Loader2, Trash2, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csvExport";

type Verificacion = {
  id: string;
  estado: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  notas_admin: string | null;
  total_unidades: number;
};

type Liquidacion = {
  id: string;
  fecha_liquidacion: string;
  total_boletos: number;
  monto_valor_facial: number;
  monto_comision_todocerca: number;
  monto_fee_stripe_connect: number;
  monto_neto: number;
  estado: string;
  stripe_transfer_id: string | null;
};

type FraudeResumen = {
  id: string;
  fecha_intento: string;
  severidad: string;
  tipo_fraude: string;
  distancia_km: number | null;
  tiempo_transcurrido_minutos: number | null;
  total_intentos_usuario: number;
  resuelto: boolean;
};

type UnidadDetalle = {
  id: string;
  numero_economico: string;
  placas: string;
  modelo: string | null;
  linea: string | null;
  estado_verificacion: string | null;
};

type IngresoUnidad = {
  unidad_id: string;
  numero_economico: string;
  placas: string | null;
  descripcion: string | null;
  chofer_nombre: string | null;
  boletos_hoy: number;
  ingresos_hoy: number;
};

export default function PanelConcesionario() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [proveedor, setProveedor] = useState<any>(null);
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [fraudes, setFraudes] = useState<FraudeResumen[]>([]);
  const [cuentaConectada, setCuentaConectada] = useState<any>(null);
  const [stats, setStats] = useState({ hoy: 0, semana: 0, mes: 0, totalMes: 0, totalUnidades: 0 });
  const [expandedLiq, setExpandedLiq] = useState<string | null>(null);
  const [ingresosUnidad, setIngresosUnidad] = useState<IngresoUnidad[]>([]);
  const [expandedUnidad, setExpandedUnidad] = useState<string | null>(null);
  const [unidadTickets, setUnidadTickets] = useState<{ short_code: string; time: string }[]>([]);
  const [loadingUnidadTickets, setLoadingUnidadTickets] = useState(false);
  
  // Unit registration form
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ numero_economico: "", placas: "", modelo: "", linea: "" });
  const [savingUnit, setSavingUnit] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) fetchAll();
  }, [user, authLoading]);

  const fetchAll = async () => {
    try {
      // Get provider
      const { data: prov } = await supabase
        .from("proveedores")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (!prov) {
        toast.error("No tienes un perfil de proveedor/concesionario");
        navigate("/dashboard");
        return;
      }
      setProveedor(prov);

      // Fetch everything in parallel
      const [verifRes, unidadesRes, liqRes, fraudeRes, cuentaRes] = await Promise.all([
        supabase
          .from("verificaciones_concesionario")
          .select("*")
          .eq("concesionario_id", prov.id)
          .order("fecha_solicitud", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("detalles_verificacion_unidad")
          .select("id, numero_economico, placas, modelo, linea, estado_verificacion, verificacion_id")
          .in(
            "verificacion_id",
            (
              await supabase
                .from("verificaciones_concesionario")
                .select("id")
                .eq("concesionario_id", prov.id)
            ).data?.map((v: any) => v.id) || []
          ),
        supabase
          .from("liquidaciones_diarias")
          .select("*")
          .in(
            "cuenta_conectada_id",
            (
              await supabase
                .from("cuentas_conectadas")
                .select("id")
                .eq("concesionario_id", prov.id)
            ).data?.map((c: any) => c.id) || []
          )
          .order("fecha_liquidacion", { ascending: false })
          .limit(30),
        supabase
          .from("intentos_fraude")
          .select("id, fecha_intento, severidad, tipo_fraude, distancia_km, tiempo_transcurrido_minutos, total_intentos_usuario, resuelto")
          .order("fecha_intento", { ascending: false })
          .limit(50),
        supabase
          .from("cuentas_conectadas")
          .select("*")
          .eq("concesionario_id", prov.id)
          .single(),
      ]);

      if (verifRes.data) setVerificacion(verifRes.data as any);
      if (unidadesRes.data) setUnidades(unidadesRes.data as any);
      if (liqRes.data) setLiquidaciones(liqRes.data as any);
      if (fraudeRes.data) setFraudes(fraudeRes.data as any);
      if (cuentaRes.data) setCuentaConectada(cuentaRes.data);

      // Calculate stats from liquidaciones (for historical) and logs (for today)
      const monthStart = new Date().toISOString().slice(0, 7) + "-01";
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

      if (liqRes.data && liqRes.data.length > 0) {
        const weekLiqs = (liqRes.data as any[]).filter((l) => l.fecha_liquidacion >= weekAgo);
        const monthLiqs = (liqRes.data as any[]).filter((l) => l.fecha_liquidacion >= monthStart);

        setStats((prev) => ({
          ...prev,
          semana: weekLiqs.reduce((s: number, l: any) => s + l.total_boletos, 0),
          totalMes: monthLiqs.reduce((s: number, l: any) => s + Number(l.monto_neto), 0),
        }));
      }
      // Fetch per-unit revenue for today
      const { data: misUnidades } = await supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas, descripcion")
        .eq("proveedor_id", prov.id);

      if (misUnidades && misUnidades.length > 0) {
        const unidadIds = misUnidades.map((u: any) => u.id);
        // Use Hermosillo time (UTC-7, no DST) for "today"
        const now = new Date();
        const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
        const todayStr = hermosillo.toISOString().split("T")[0];
        const todayStart = `${todayStr}T00:00:00-07:00`;
        const todayEnd = `${todayStr}T23:59:59-07:00`;

        // Also calculate month start for accumulated month income
        const monthStart = `${todayStr.slice(0, 7)}-01T00:00:00-07:00`;

        const { data: logsHoy } = await supabase
          .from("logs_validacion_qr")
          .select("unidad_id, chofer_id")
          .in("unidad_id", unidadIds)
          .eq("resultado", "valid")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd);

        // Fetch month logs for accumulated income
        const { count: logsMesCount } = await supabase
          .from("logs_validacion_qr")
          .select("id", { count: "exact", head: true })
          .in("unidad_id", unidadIds)
          .eq("resultado", "valid")
          .gte("created_at", monthStart)
          .lte("created_at", todayEnd);

        // Fetch week logs
        const weekAgoDate = new Date(hermosillo.getTime() - 7 * 86400000);
        const weekAgoStr = weekAgoDate.toISOString().split("T")[0];
        const weekStart = `${weekAgoStr}T00:00:00-07:00`;
        const { count: logsSemanaCount } = await supabase
          .from("logs_validacion_qr")
          .select("id", { count: "exact", head: true })
          .in("unidad_id", unidadIds)
          .eq("resultado", "valid")
          .gte("created_at", weekStart)
          .lte("created_at", todayEnd);

        // Get active driver assignments for today
        const { data: asignaciones } = await supabase
          .from("asignaciones_chofer")
          .select("unidad_id, chofer_id, choferes_empresa(nombre)")
          .in("unidad_id", unidadIds)
          .eq("fecha", todayStr);

        const choferMap: Record<string, string> = {};
        (asignaciones || []).forEach((a: any) => {
          if (a.unidad_id && a.choferes_empresa?.nombre) {
            choferMap[a.unidad_id] = a.choferes_empresa.nombre;
          }
        });

        // Group logs by unidad_id
        const countMap: Record<string, number> = {};
        (logsHoy || []).forEach((log: any) => {
          if (log.unidad_id) {
            countMap[log.unidad_id] = (countMap[log.unidad_id] || 0) + 1;
          }
        });

        const ingresos: IngresoUnidad[] = misUnidades.map((u: any) => ({
          unidad_id: u.id,
          numero_economico: u.numero_economico || u.nombre,
          placas: u.placas,
          descripcion: u.descripcion,
          chofer_nombre: choferMap[u.id] || null,
          boletos_hoy: countMap[u.id] || 0,
          ingresos_hoy: (countMap[u.id] || 0) * 9,
        })).sort((a: IngresoUnidad, b: IngresoUnidad) => b.boletos_hoy - a.boletos_hoy);

        setIngresosUnidad(ingresos);

        // Set real-time today stats from actual logs
        const totalBoletosHoy = ingresos.reduce((s: number, u: IngresoUnidad) => s + u.boletos_hoy, 0);
        setStats({
          hoy: totalBoletosHoy,
          semana: logsSemanaCount || 0,
          totalMes: (logsMesCount || 0) * 9,
          mes: logsMesCount || 0,
          totalUnidades: misUnidades.length,
        });
      } else {
        setStats(prev => ({ ...prev, totalUnidades: 0 }));
      }
    } catch (err) {
      console.error("Error loading panel:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUnidadTickets = async (unidadId: string) => {
    if (expandedUnidad === unidadId) {
      setExpandedUnidad(null);
      return;
    }
    setExpandedUnidad(unidadId);
    setLoadingUnidadTickets(true);
    try {
      const now = new Date();
      const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      const todayStr = hermosillo.toISOString().split("T")[0];
      const todayStart = `${todayStr}T00:00:00-07:00`;
      const todayEnd = `${todayStr}T23:59:59-07:00`;

      const { data } = await supabase
        .from("logs_validacion_qr")
        .select("qr_ticket_id, created_at")
        .eq("unidad_id", unidadId)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        setUnidadTickets(data.map((d: any) => ({
          short_code: (d.qr_ticket_id || "").slice(-6).toUpperCase(),
          time: new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        })));
      } else {
        setUnidadTickets([]);
      }
    } catch (err) {
      console.error("Error loading unit tickets:", err);
    } finally {
      setLoadingUnidadTickets(false);
    }
  };

  const handleStripeConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        body: { concesionario_id: proveedor.id },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Error al crear cuenta Stripe");
    }
  };

  const handleAddUnit = async () => {
    if (!newUnit.numero_economico.trim() || !newUnit.placas.trim()) {
      toast.error("Número económico y placas son obligatorios");
      return;
    }
    setSavingUnit(true);
    try {
      let verifId = verificacion?.id;

      // Create verification request if none exists
      if (!verifId) {
        const { data: newVerif, error: verifError } = await (supabase
          .from("verificaciones_concesionario") as any)
          .insert({
            concesionario_id: proveedor.id,
            estado: "pending",
            total_unidades: 0,
          })
          .select("id")
          .single();

        if (verifError) throw verifError;
        verifId = newVerif.id;
      }

      // Insert unit detail
      const { error: unitError } = await supabase
        .from("detalles_verificacion_unidad")
        .insert({
          verificacion_id: verifId,
          numero_economico: newUnit.numero_economico.trim().toUpperCase(),
          placas: newUnit.placas.trim().toUpperCase(),
          modelo: newUnit.modelo.trim() || null,
          linea: newUnit.linea.trim() || null,
          estado_verificacion: "pending",
        });

      if (unitError) throw unitError;

      // Update total_unidades count
      const { count } = await supabase
        .from("detalles_verificacion_unidad")
        .select("id", { count: "exact", head: true })
        .eq("verificacion_id", verifId);

      await (supabase
        .from("verificaciones_concesionario") as any)
        .update({ total_unidades: count || 0 })
        .eq("id", verifId);

      toast.success("Unidad registrada correctamente");
      setNewUnit({ numero_economico: "", placas: "", modelo: "", linea: "" });
      setShowAddUnit(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar unidad");
    } finally {
      setSavingUnit(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm("¿Eliminar esta unidad?")) return;
    try {
      const { error } = await supabase
        .from("detalles_verificacion_unidad")
        .delete()
        .eq("id", unitId);
      if (error) throw error;

      // Update count
      if (verificacion?.id) {
        const { count } = await supabase
          .from("detalles_verificacion_unidad")
          .select("id", { count: "exact", head: true })
          .eq("verificacion_id", verificacion.id);

        await (supabase
          .from("verificaciones_concesionario") as any)
          .update({ total_unidades: count || 0 })
          .eq("id", verificacion.id);
      }

      toast.success("Unidad eliminada");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar unidad");
    }
  };

  const handleDownloadCSVConcesionario = async () => {
    if (!proveedor) return;
    try {
      const now = new Date();
      const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      const todayStr = hermosillo.toISOString().split("T")[0];
      const todayStart = `${todayStr}T00:00:00-07:00`;
      const todayEnd = `${todayStr}T23:59:59-07:00`;

      // Get all units for this provider
      const { data: misUnidades } = await supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas")
        .eq("proveedor_id", proveedor.id);

      if (!misUnidades || misUnidades.length === 0) {
        toast.info("No hay unidades registradas");
        return;
      }

      const unidadIds = misUnidades.map((u: any) => u.id);
      const unidadMap: Record<string, any> = {};
      misUnidades.forEach((u: any) => { unidadMap[u.id] = u; });

      const { data: logs } = await supabase
        .from("logs_validacion_qr")
        .select("qr_ticket_id, created_at, unidad_id")
        .in("unidad_id", unidadIds)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .order("created_at", { ascending: true });

      if (!logs || logs.length === 0) {
        toast.info("No hay boletos para exportar hoy");
        return;
      }

      const rows = logs.map((d: any, i: number) => {
        const u = unidadMap[d.unidad_id];
        return [
          String(i + 1),
          (d.qr_ticket_id || "").slice(-6).toUpperCase(),
          new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          u ? (u.numero_economico || u.nombre) : "",
          u?.placas || "",
          "$9.00",
        ];
      });

      downloadCSV(
        `boletos-concesionario-${todayStr}.csv`,
        ["#", "Código", "Hora", "Unidad", "Placas", "Monto"],
        rows
      );
      toast.success("CSV descargado");
    } catch (err) {
      console.error("CSV export error:", err);
      toast.error("Error al exportar CSV");
    }
  };

  const handleWhatsAppDocuments = () => {
    const phone = "526621234567"; // TODO: Replace with admin's actual WhatsApp number
    const message = encodeURIComponent(
      `Hola, soy ${proveedor?.nombre_negocio || proveedor?.nombre || "concesionario"} y quiero enviar mis documentos para verificación:\n\n` +
      `- INE / Identificación Oficial\n` +
      `- Concesión IMTES\n` +
      `- RFC (Constancia de Situación Fiscal)\n` +
      `- Comprobante de Domicilio\n` +
      `- Tarjeta de Circulación\n` +
      `- Fotografías de unidades\n\n` +
      `ID Proveedor: ${proveedor?.id}`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando panel...</div>
      </div>
    );
  }

  const estadoVerifColor = (e?: string) => {
    switch (e) {
      case "approved": return "bg-green-600 text-white";
      case "rejected": return "bg-destructive text-destructive-foreground";
      case "in_review": return "bg-amber-500 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const estadoVerifLabel = (e?: string) => {
    switch (e) {
      case "approved": return "Aprobado";
      case "rejected": return "Rechazado";
      case "in_review": return "En Revisión";
      default: return "Pendiente";
    }
  };

  const severidadColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-900 text-red-100";
      case "high": return "bg-red-700 text-red-100";
      case "medium": return "bg-orange-600 text-orange-100";
      default: return "bg-yellow-600 text-yellow-100";
    }
  };

  const estadoLiqColor = (e: string) => {
    switch (e) {
      case "completed": return "bg-green-600 text-white";
      case "failed": return "bg-destructive text-destructive-foreground";
      default: return "bg-amber-500 text-white";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Panel Concesionario</h1>
            <p className="text-xs text-muted-foreground">
              {proveedor?.nombre || "Gestión de transporte"}
            </p>
          </div>
          {verificacion && (
            <Badge className={estadoVerifColor(verificacion.estado)}>
              {estadoVerifLabel(verificacion.estado)}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.hoy}</p>
              <p className="text-xs text-muted-foreground">Pasajeros hoy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">${stats.totalMes.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Neto este mes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.semana}</p>
              <p className="text-xs text-muted-foreground">Semana</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Bus className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.totalUnidades}</p>
              <p className="text-xs text-muted-foreground">Unidades</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ingresos" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ingresos" className="text-xs">
              <BarChart3 className="h-3 w-3 mr-1" /> Ingresos
            </TabsTrigger>
            <TabsTrigger value="verificacion" className="text-xs">
              <ShieldCheck className="h-3 w-3 mr-1" /> Verif.
            </TabsTrigger>
            <TabsTrigger value="unidades" className="text-xs">
              <Bus className="h-3 w-3 mr-1" /> Unidades
            </TabsTrigger>
            <TabsTrigger value="liquidaciones" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" /> Pagos
            </TabsTrigger>
            <TabsTrigger value="fraude" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" /> Fraude
            </TabsTrigger>
          </TabsList>

          {/* INGRESOS POR UNIDAD */}
          <TabsContent value="ingresos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Ingresos del día por unidad
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={handleDownloadCSVConcesionario} className="h-7 text-xs gap-1">
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  Boletos QR validados hoy · $9.00 MXN c/u
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {ingresosUnidad.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Bus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay unidades registradas</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Unidad</TableHead>
                        <TableHead className="text-xs">Chofer</TableHead>
                        <TableHead className="text-xs text-right">Boletos</TableHead>
                        <TableHead className="text-xs text-right">Ingreso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingresosUnidad.map((u) => (
                        <React.Fragment key={u.unidad_id}>
                          <TableRow 
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => u.boletos_hoy > 0 && toggleUnidadTickets(u.unidad_id)}
                          >
                            <TableCell className="py-2">
                              <p className="font-bold text-sm">#{u.numero_economico}</p>
                              {u.placas && (
                                <p className="text-xs text-muted-foreground">{u.placas}</p>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-sm">
                              {u.chofer_nombre || <span className="text-muted-foreground text-xs">Sin asignar</span>}
                            </TableCell>
                            <TableCell className="py-2 text-right font-semibold text-sm">
                              {u.boletos_hoy}
                              {u.boletos_hoy > 0 && (
                                <span className="text-[10px] text-primary ml-1">
                                  {expandedUnidad === u.unidad_id ? "▲" : "▼"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-right font-bold text-sm text-green-600">
                              ${u.ingresos_hoy.toFixed(0)}
                            </TableCell>
                          </TableRow>
                          {expandedUnidad === u.unidad_id && (
                            <TableRow>
                              <TableCell colSpan={4} className="p-0">
                                <div className="bg-muted/30 p-3">
                                  <p className="text-xs font-semibold text-muted-foreground mb-2">Boletos validados</p>
                                  {loadingUnidadTickets ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Cargando...</p>
                                  ) : unidadTickets.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Sin boletos</p>
                                  ) : (
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                      {unidadTickets.map((t, i) => (
                                        <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                                          <span className="font-mono text-sm font-bold text-foreground">#{t.short_code}</span>
                                          <span className="text-xs text-muted-foreground">{t.time}</span>
                                          <span className="text-xs font-semibold text-primary">$9.00</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 border-border bg-muted/50">
                        <TableCell colSpan={2} className="py-2 font-bold text-sm">
                          Total ({ingresosUnidad.filter(u => u.boletos_hoy > 0).length} unidades activas)
                        </TableCell>
                        <TableCell className="py-2 text-right font-bold text-sm">
                          {ingresosUnidad.reduce((s, u) => s + u.boletos_hoy, 0)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-bold text-sm text-green-600">
                          ${ingresosUnidad.reduce((s, u) => s + u.ingresos_hoy, 0).toFixed(0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VERIFICACIÓN */}
          <TabsContent value="verificacion" className="space-y-4 mt-4">
            {/* Stripe Connect */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Cuenta Stripe Connect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cuentaConectada ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Estado:</span>
                      <Badge className={cuentaConectada.pagos_habilitados ? "bg-green-600 text-white" : "bg-amber-500 text-white"}>
                        {cuentaConectada.pagos_habilitados ? "Activa" : "Pendiente"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Transferencias:</span>
                      <span className="text-sm">
                        {cuentaConectada.transferencias_habilitadas ? "✅ Habilitadas" : "❌ No habilitadas"}
                      </span>
                    </div>
                    {!cuentaConectada.pagos_habilitados && (
                      <Button onClick={handleStripeConnect} className="w-full" size="sm">
                        Completar configuración de Stripe
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Necesitas vincular tu cuenta bancaria para recibir pagos.
                    </p>
                    <Button onClick={handleStripeConnect} className="w-full">
                      Configurar Stripe Connect
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Verificación Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Estado de Verificación
                </CardTitle>
              </CardHeader>
              <CardContent>
                {verificacion ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Estado:</span>
                      <Badge className={estadoVerifColor(verificacion.estado)}>
                        {estadoVerifLabel(verificacion.estado)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Solicitud:</span>
                      <span className="text-sm">
                        {new Date(verificacion.fecha_solicitud).toLocaleDateString("es-MX")}
                      </span>
                    </div>
                    {verificacion.fecha_revision && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Revisión:</span>
                        <span className="text-sm">
                          {new Date(verificacion.fecha_revision).toLocaleDateString("es-MX")}
                        </span>
                      </div>
                    )}
                    {verificacion.notas_admin && (
                      <div className="bg-muted rounded-lg p-3 text-sm">
                        <p className="font-medium text-foreground mb-1">Notas del administrador:</p>
                        <p className="text-muted-foreground">{verificacion.notas_admin}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unidades registradas:</span>
                      <span className="text-sm font-bold">{verificacion.total_unidades}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay solicitud de verificación</p>
                    <p className="text-xs mt-1">
                      Registra tus unidades y envía tus documentos para iniciar la verificación
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Required Documents + WhatsApp */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documentos Requeridos
                </CardTitle>
                <CardDescription className="text-xs">
                  Envía estos documentos por WhatsApp al administrador
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  {[
                    "INE / Identificación Oficial",
                    "Concesión IMTES",
                    "RFC (Constancia de Situación Fiscal)",
                    "Comprobante de Domicilio",
                    "Tarjeta de Circulación (por unidad)",
                    "Fotografías de unidades",
                  ].map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-muted-foreground">{doc}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={handleWhatsAppDocuments} className="w-full bg-green-600 hover:bg-green-700 text-white" size="sm">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Enviar documentos por WhatsApp
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* UNIDADES */}
          <TabsContent value="unidades" className="space-y-3 mt-4">
            {/* Add Unit Button */}
            <Button onClick={() => setShowAddUnit(!showAddUnit)} variant="outline" className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {showAddUnit ? "Cancelar" : "Registrar nueva unidad"}
            </Button>

            {/* Add Unit Form */}
            {showAddUnit && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Número Económico *</Label>
                      <Input
                        placeholder="Ej: 101"
                        value={newUnit.numero_economico}
                        onChange={(e) => setNewUnit({ ...newUnit, numero_economico: e.target.value })}
                        maxLength={20}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Placas *</Label>
                      <Input
                        placeholder="Ej: ABC-123"
                        value={newUnit.placas}
                        onChange={(e) => setNewUnit({ ...newUnit, placas: e.target.value })}
                        maxLength={20}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Línea</Label>
                      <Input
                        placeholder="Ej: Mercedes"
                        value={newUnit.linea}
                        onChange={(e) => setNewUnit({ ...newUnit, linea: e.target.value })}
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Modelo</Label>
                      <Input
                        placeholder="Ej: 2020"
                        value={newUnit.modelo}
                        onChange={(e) => setNewUnit({ ...newUnit, modelo: e.target.value })}
                        maxLength={20}
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddUnit} disabled={savingUnit} className="w-full" size="sm">
                    {savingUnit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Registrar unidad
                  </Button>
                </CardContent>
              </Card>
            )}

            {unidades.length === 0 && !showAddUnit ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Bus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No hay unidades registradas</p>
                  <p className="text-xs mt-1">Presiona "Registrar nueva unidad" para agregar</p>
                </CardContent>
              </Card>
            ) : (
              unidades.map((u) => (
                <Card key={u.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground text-lg">#{u.numero_economico}</p>
                        <p className="text-sm text-muted-foreground">
                          Placas: {u.placas}
                          {u.linea && ` • ${u.linea}`}
                          {u.modelo && ` ${u.modelo}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={estadoVerifColor(u.estado_verificacion || undefined)}>
                          {estadoVerifLabel(u.estado_verificacion || undefined)}
                        </Badge>
                        {u.estado_verificacion === "pending" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteUnit(u.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* LIQUIDACIONES */}
          <TabsContent value="liquidaciones" className="space-y-3 mt-4">
            {liquidaciones.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No hay liquidaciones registradas</p>
                </CardContent>
              </Card>
            ) : (
              liquidaciones.map((l) => (
                <Card key={l.id} className="cursor-pointer" onClick={() => setExpandedLiq(expandedLiq === l.id ? null : l.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {new Date(l.fecha_liquidacion + "T12:00:00").toLocaleDateString("es-MX", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {l.total_boletos} boletos
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="font-bold text-foreground">${Number(l.monto_neto).toFixed(2)}</p>
                          <Badge className={`text-xs ${estadoLiqColor(l.estado)}`}>
                            {l.estado === "completed" ? "Pagado" : l.estado === "failed" ? "Error" : "Pendiente"}
                          </Badge>
                        </div>
                        {expandedLiq === l.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedLiq === l.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valor facial ({l.total_boletos} × $9.00):</span>
                          <span className="text-foreground">${Number(l.monto_valor_facial).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Comisión TodoCerca (5%):</span>
                          <span className="text-destructive">-${Number(l.monto_comision_todocerca).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Comisión Stripe:</span>
                          <span className="text-destructive">-${Number(l.monto_fee_stripe_connect).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold pt-1 border-t border-border">
                          <span>Neto depositado:</span>
                          <span className="text-green-600">${Number(l.monto_neto).toFixed(2)}</span>
                        </div>
                        {l.stripe_transfer_id && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Transfer: {l.stripe_transfer_id}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* FRAUDE */}
          <TabsContent value="fraude" className="space-y-3 mt-4">
            {fraudes.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No se han detectado intentos de fraude</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Resumen */}
                <Card className="border-destructive/30">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold text-foreground">{fraudes.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">
                          {fraudes.filter((f) => f.severidad === "critical" || f.severidad === "high").length}
                        </p>
                        <p className="text-xs text-muted-foreground">Alta/Crítica</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {fraudes.filter((f) => !f.resuelto).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Sin resolver</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {fraudes.map((f) => (
                  <Card key={f.id} className={f.resuelto ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={severidadColor(f.severidad)}>
                            {f.severidad === "critical" ? "CRÍTICA" : f.severidad === "high" ? "ALTA" : f.severidad === "medium" ? "MEDIA" : "BAJA"}
                          </Badge>
                          {f.resuelto && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Resuelto
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(f.fecha_intento).toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Tipo:</span>{" "}
                          {f.tipo_fraude === "misma_unidad" ? "Misma unidad" : "Otra unidad"}
                        </p>
                        {f.tiempo_transcurrido_minutos !== null && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Tiempo:</span>{" "}
                            {f.tiempo_transcurrido_minutos} min después
                          </p>
                        )}
                        {f.distancia_km !== null && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Distancia:</span>{" "}
                            {f.distancia_km.toFixed(1)} km
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Intentos usuario:</span>{" "}
                          {f.total_intentos_usuario}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <NavigationBar />
    </div>
  );
}
