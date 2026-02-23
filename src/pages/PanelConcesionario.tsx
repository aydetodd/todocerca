import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, FileText, DollarSign, AlertTriangle, Bus, TrendingUp,
  Clock, CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [stats, setStats] = useState({ hoy: 0, semana: 0, mes: 0, totalMes: 0 });
  const [expandedLiq, setExpandedLiq] = useState<string | null>(null);

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

      // Calculate stats
      if (liqRes.data && liqRes.data.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const monthStart = new Date().toISOString().slice(0, 7) + "-01";

        const todayLiq = (liqRes.data as any[]).find((l) => l.fecha_liquidacion === today);
        const weekLiqs = (liqRes.data as any[]).filter((l) => l.fecha_liquidacion >= weekAgo);
        const monthLiqs = (liqRes.data as any[]).filter((l) => l.fecha_liquidacion >= monthStart);

        setStats({
          hoy: todayLiq?.total_boletos || 0,
          semana: weekLiqs.reduce((s: number, l: any) => s + l.total_boletos, 0),
          mes: monthLiqs.reduce((s: number, l: any) => s + l.total_boletos, 0),
          totalMes: monthLiqs.reduce((s: number, l: any) => s + Number(l.monto_neto), 0),
        });
      }
    } catch (err) {
      console.error("Error loading panel:", err);
    } finally {
      setLoading(false);
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
              <p className="text-2xl font-bold text-foreground">{unidades.length}</p>
              <p className="text-xs text-muted-foreground">Unidades</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="verificacion" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
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
                      Contacta al administrador para iniciar la verificación
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Required Documents */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documentos Requeridos
                </CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* UNIDADES */}
          <TabsContent value="unidades" className="space-y-3 mt-4">
            {unidades.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Bus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No hay unidades registradas</p>
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
                      <Badge className={estadoVerifColor(u.estado_verificacion || undefined)}>
                        {estadoVerifLabel(u.estado_verificacion || undefined)}
                      </Badge>
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
