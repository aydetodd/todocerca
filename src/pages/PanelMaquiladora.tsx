import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Users, QrCode, BarChart3, FileText, Plus, Download, Trash2, RefreshCw, Send } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Empresa {
  id: string;
  nombre: string;
  rfc: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
}

interface Empleado {
  id: string;
  nombre: string;
  numero_nomina: string | null;
  departamento: string | null;
  turno: string | null;
  qr_tipo: string;
  is_active: boolean;
}

interface Contrato {
  id: string;
  concesionario_id: string;
  tarifa_por_persona: number;
  descripcion: string | null;
  frecuencia_corte: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  is_active: boolean;
}

interface QrEmpleado {
  id: string;
  empleado_id: string;
  token: string;
  qr_tipo: string;
  status: string;
  fecha_vigencia_inicio: string;
  fecha_vigencia_fin: string | null;
}

export default function PanelMaquiladora() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [validacionesHoy, setValidacionesHoy] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRegistro, setShowRegistro] = useState(false);
  const [showAddEmpleado, setShowAddEmpleado] = useState(false);
  const [showQr, setShowQr] = useState<QrEmpleado | null>(null);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [showMassSend, setShowMassSend] = useState(false);
  const [massSending, setMassSending] = useState(false);

  // Registration form
  const [regNombre, setRegNombre] = useState("");
  const [regRfc, setRegRfc] = useState("");
  const [regContacto, setRegContacto] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regTelefono, setRegTelefono] = useState("");

  // Add employee form
  const [empNombre, setEmpNombre] = useState("");
  const [empNomina, setEmpNomina] = useState("");
  const [empDepto, setEmpDepto] = useState("");
  const [empTurno, setEmpTurno] = useState("matutino");
  const [empQrTipo, setEmpQrTipo] = useState("fijo");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) loadEmpresa();
  }, [user, authLoading]);

  const loadEmpresa = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("empresas_transporte")
      .select("*")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      setEmpresa(data);
      await Promise.all([
        loadEmpleados(data.id),
        loadContratos(data.id),
        loadValidacionesHoy(data.id),
      ]);
    } else {
      setShowRegistro(true);
    }
    setLoading(false);
  };

  const loadEmpleados = async (empresaId: string) => {
    const { data } = await supabase
      .from("empleados_empresa")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nombre");
    if (data) setEmpleados(data);
  };

  const loadContratos = async (empresaId: string) => {
    const { data } = await supabase
      .from("contratos_transporte")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });
    if (data) setContratos(data);
  };

  const loadValidacionesHoy = async (empresaId: string) => {
    const hermosilloToday = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { count } = await supabase
      .from("validaciones_transporte_personal")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("fecha_local", hermosilloToday);
    setValidacionesHoy(count ?? 0);
  };

  const handleMassSendQr = async () => {
    if (!empresa) return;
    setMassSending(true);
    
    const activeEmps = empleados.filter(e => e.is_active);
    let renovados = 0;
    let enviados = 0;
    let sinCuenta = 0;

    for (const emp of activeEmps) {
      // 1. Regenerate QR for rotativo employees
      if (emp.qr_tipo === "rotativo") {
        await supabase
          .from("qr_empleados")
          .update({ status: "revoked" })
          .eq("empleado_id", emp.id)
          .eq("status", "active");

        await supabase.from("qr_empleados").insert({
          empleado_id: emp.id,
          empresa_id: empresa.id,
          qr_tipo: "rotativo",
          fecha_vigencia_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        });
        renovados++;
      }

      // 2. Get the active QR for this employee
      const { data: qr } = await supabase
        .from("qr_empleados")
        .select("token")
        .eq("empleado_id", emp.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!qr) continue;

      // 3. Send via internal message if employee has an app account
      if (emp.user_id) {
        const shortCode = String(qr.token).slice(-6).toUpperCase();
        const message = `🏭 ${empresa.nombre}\n\n📋 Hola ${emp.nombre}, aquí está tu código QR de transporte:\n\n🔑 Código: ${shortCode}\n🎫 Token: ${qr.token}\n📅 Tipo: ${emp.qr_tipo === "fijo" ? "Permanente" : "Rotativo (renovable)"}\n\nMuestra este código al chofer al abordar la unidad.`;

        await supabase.from("messages").insert({
          sender_id: user!.id,
          receiver_id: emp.user_id,
          message,
          is_panic: false,
          is_read: false,
        });
        enviados++;
      } else {
        sinCuenta++;
      }
    }

    setMassSending(false);
    setShowMassSend(false);
    
    let description = `${renovados} QR renovados, ${enviados} mensajes enviados.`;
    if (sinCuenta > 0) {
      description += ` ${sinCuenta} empleados sin cuenta en la app (comparte su QR manualmente).`;
    }
    
    toast({ title: "✅ Envío masivo completado", description });
    await loadEmpleados(empresa.id);
  };

  const handleRegistroEmpresa = async () => {
    if (!regNombre.trim()) {
      toast({ title: "Error", description: "Ingresa el nombre de la empresa", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("empresas_transporte")
      .insert({
        nombre: regNombre,
        rfc: regRfc || null,
        contacto_nombre: regContacto || null,
        contacto_email: regEmail || null,
        contacto_telefono: regTelefono || null,
        user_id: user!.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setEmpresa(data);
    setShowRegistro(false);
    toast({ title: "✅ Empresa registrada" });
  };

  const handleAddEmpleado = async () => {
    if (!empNombre.trim() || !empresa) return;

    const { data: newEmp, error } = await supabase
      .from("empleados_empresa")
      .insert({
        empresa_id: empresa.id,
        nombre: empNombre,
        numero_nomina: empNomina || null,
        departamento: empDepto || null,
        turno: empTurno,
        qr_tipo: empQrTipo,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Auto-generate QR for the employee
    if (newEmp) {
      await supabase.from("qr_empleados").insert({
        empleado_id: newEmp.id,
        empresa_id: empresa.id,
        qr_tipo: empQrTipo,
        fecha_vigencia_fin: empQrTipo === "rotativo"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : null,
      });
    }

    setShowAddEmpleado(false);
    setEmpNombre(""); setEmpNomina(""); setEmpDepto(""); setEmpTurno("matutino"); setEmpQrTipo("fijo");
    await loadEmpleados(empresa.id);
    toast({ title: "✅ Empleado agregado" });
  };

  const handleGenerateQr = async (empleado: Empleado) => {
    if (!empresa) return;

    // Revoke old active QRs for rotativo
    if (empleado.qr_tipo === "rotativo") {
      await supabase
        .from("qr_empleados")
        .update({ status: "revoked" })
        .eq("empleado_id", empleado.id)
        .eq("status", "active");
    }

    const { data: qr } = await supabase
      .from("qr_empleados")
      .insert({
        empleado_id: empleado.id,
        empresa_id: empresa.id,
        qr_tipo: empleado.qr_tipo,
        fecha_vigencia_fin: empleado.qr_tipo === "rotativo"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : null,
      })
      .select()
      .single();

    if (qr) {
      setShowQr(qr);
      setSelectedEmpleado(empleado);
    }
  };

  const handleViewQr = async (empleado: Empleado) => {
    const { data: qr } = await supabase
      .from("qr_empleados")
      .select("*")
      .eq("empleado_id", empleado.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (qr) {
      setShowQr(qr);
      setSelectedEmpleado(empleado);
    } else {
      toast({ title: "Sin QR activo", description: "Genera uno nuevo", variant: "destructive" });
    }
  };

  const handleToggleEmpleado = async (emp: Empleado) => {
    await supabase
      .from("empleados_empresa")
      .update({ is_active: !emp.is_active })
      .eq("id", emp.id);
    if (empresa) await loadEmpleados(empresa.id);
  };

  const handleExportCSV = () => {
    if (!empleados.length) return;
    const headers = "Nombre,Nómina,Departamento,Turno,Tipo QR,Activo\n";
    const rows = empleados.map(e =>
      `"${e.nombre}","${e.numero_nomina || ""}","${e.departamento || ""}","${e.turno || ""}","${e.qr_tipo}","${e.is_active ? "Sí" : "No"}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empleados-${empresa?.nombre || "empresa"}.csv`;
    a.click();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Registration form
  if (showRegistro || !empresa) {
    return (
      <div className="min-h-screen bg-background p-4">
        <BackButton />
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Registrar Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nombre de la empresa *</Label>
              <Input value={regNombre} onChange={e => setRegNombre(e.target.value)} placeholder="Ej: Maquiladora del Norte S.A." />
            </div>
            <div>
              <Label>RFC</Label>
              <Input value={regRfc} onChange={e => setRegRfc(e.target.value)} placeholder="RFC de la empresa" />
            </div>
            <div>
              <Label>Nombre de contacto</Label>
              <Input value={regContacto} onChange={e => setRegContacto(e.target.value)} placeholder="Persona responsable" />
            </div>
            <div>
              <Label>Email de contacto</Label>
              <Input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="contacto@empresa.com" />
            </div>
            <div>
              <Label>Teléfono de contacto</Label>
              <Input value={regTelefono} onChange={e => setRegTelefono(e.target.value)} placeholder="+52 662 123 4567" />
            </div>
            <Button onClick={handleRegistroEmpresa} className="w-full">Registrar empresa</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeEmpleados = empleados.filter(e => e.is_active).length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4">
        <BackButton />
        <div className="flex items-center gap-2 mt-2 mb-4">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">{empresa.nombre}</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <div className="text-lg font-bold">{activeEmpleados}</div>
              <div className="text-[10px] text-muted-foreground">Empleados</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <QrCode className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <div className="text-lg font-bold">{validacionesHoy}</div>
              <div className="text-[10px] text-muted-foreground">Hoy</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <FileText className="h-5 w-5 mx-auto text-orange-500 mb-1" />
              <div className="text-lg font-bold">{contratos.filter(c => c.is_active).length}</div>
              <div className="text-[10px] text-muted-foreground">Contratos</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="empleados" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="empleados">Empleados</TabsTrigger>
            <TabsTrigger value="reportes">Reportes</TabsTrigger>
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
          </TabsList>

          {/* EMPLEADOS TAB */}
          <TabsContent value="empleados" className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowAddEmpleado(true)} className="flex-1">
                <Plus className="h-4 w-4 mr-1" /> Agregar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowMassSend(true)} title="Envío masivo de QR">
                <Send className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => empresa && loadEmpleados(empresa.id)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {empleados.map(emp => (
              <Card key={emp.id} className={!emp.is_active ? "opacity-50" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{emp.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {emp.numero_nomina && `#${emp.numero_nomina} · `}
                        {emp.departamento && `${emp.departamento} · `}
                        {emp.turno}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={emp.qr_tipo === "fijo" ? "secondary" : "outline"} className="text-[10px]">
                        {emp.qr_tipo}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleViewQr(emp)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleGenerateQr(emp)}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleEmpleado(emp)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {empleados.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No hay empleados registrados</p>
                <p className="text-xs">Agrega empleados para generar sus QR</p>
              </div>
            )}
          </TabsContent>

          {/* REPORTES TAB */}
          <TabsContent value="reportes">
            <ReportesTab empresaId={empresa.id} />
          </TabsContent>

          {/* CONTRATOS TAB */}
          <TabsContent value="contratos" className="space-y-3">
            {contratos.map(c => (
              <Card key={c.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{c.descripcion || "Contrato de transporte"}</div>
                      <div className="text-xs text-muted-foreground">
                        Tarifa: ${Number(c.tarifa_por_persona).toFixed(2)} / persona · {c.frecuencia_corte}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Desde {c.fecha_inicio} {c.fecha_fin ? `hasta ${c.fecha_fin}` : "· Indefinido"}
                      </div>
                    </div>
                    <Badge variant={c.is_active ? "default" : "secondary"}>
                      {c.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}

            {contratos.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No hay contratos registrados</p>
                <p className="text-xs">Los contratos se crean al vincular con un concesionario</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Add Employee */}
      <Dialog open={showAddEmpleado} onOpenChange={setShowAddEmpleado}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar empleado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre completo *</Label>
              <Input value={empNombre} onChange={e => setEmpNombre(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div>
              <Label>Número de nómina</Label>
              <Input value={empNomina} onChange={e => setEmpNomina(e.target.value)} placeholder="001234" />
            </div>
            <div>
              <Label>Departamento</Label>
              <Input value={empDepto} onChange={e => setEmpDepto(e.target.value)} placeholder="Producción" />
            </div>
            <div>
              <Label>Turno</Label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={empTurno}
                onChange={e => setEmpTurno(e.target.value)}
              >
                <option value="matutino">Matutino</option>
                <option value="vespertino">Vespertino</option>
                <option value="nocturno">Nocturno</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <Label>Tipo de QR</Label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={empQrTipo}
                onChange={e => setEmpQrTipo(e.target.value)}
              >
                <option value="fijo">Fijo (credencial permanente)</option>
                <option value="rotativo">Rotativo (se renueva diario)</option>
              </select>
            </div>
            <Button onClick={handleAddEmpleado} className="w-full">Agregar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Show QR */}
      <Dialog open={!!showQr} onOpenChange={() => { setShowQr(null); setSelectedEmpleado(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedEmpleado?.nombre}</DialogTitle>
          </DialogHeader>
          {showQr && (
            <div className="flex flex-col items-center gap-3">
              <QRCodeSVG value={showQr.token} size={200} />
              <div className="text-center">
                <div className="font-mono text-lg font-bold tracking-wider">
                  {String(showQr.token).slice(-6).toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {showQr.qr_tipo === "fijo" ? "QR permanente" : `Válido hasta ${showQr.fecha_vigencia_fin}`}
                </div>
                {selectedEmpleado?.numero_nomina && (
                  <div className="text-xs text-muted-foreground">Nómina: #{selectedEmpleado.numero_nomina}</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Mass QR Send */}
      <AlertDialog open={showMassSend} onOpenChange={setShowMassSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Envío masivo de QR
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <p>Esta acción realizará lo siguiente para los <strong>{empleados.filter(e => e.is_active).length} empleados activos</strong>:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>🔄 <strong>Renovar</strong> los QR de tipo rotativo (vigencia 7 días)</li>
                <li>📩 <strong>Enviar</strong> el QR por mensaje interno a empleados con cuenta en la app</li>
                <li>Los QR fijos se mantienen sin cambios</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Empleados sin cuenta en la app no recibirán mensaje — comparte su QR manualmente desde el ícono 🔳.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={massSending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleMassSendQr} disabled={massSending}>
              {massSending ? "Enviando..." : "Renovar y enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Reportes sub-component
function ReportesTab({ empresaId }: { empresaId: string }) {
  const [periodo, setPeriodo] = useState("hoy");
  const [validaciones, setValidaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadReporte();
  }, [periodo, empresaId]);

  const getDateRange = () => {
    const now = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const today = now.toISOString().split("T")[0];

    switch (periodo) {
      case "hoy":
        return { start: today, end: today };
      case "ayer": {
        const ayer = new Date(now);
        ayer.setDate(ayer.getDate() - 1);
        const ayerStr = ayer.toISOString().split("T")[0];
        return { start: ayerStr, end: ayerStr };
      }
      case "semana": {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
        return { start: startOfWeek.toISOString().split("T")[0], end: today };
      }
      case "mes": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: startOfMonth.toISOString().split("T")[0], end: today };
      }
      default:
        return { start: today, end: today };
    }
  };

  const loadReporte = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    const { data, count } = await supabase
      .from("validaciones_transporte_personal")
      .select("*, empleados_empresa(nombre, numero_nomina, departamento)", { count: "exact" })
      .eq("empresa_id", empresaId)
      .gte("fecha_local", start)
      .lte("fecha_local", end)
      .order("validated_at", { ascending: false })
      .limit(100);

    setValidaciones(data || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[
          { v: "hoy", l: "Hoy" },
          { v: "ayer", l: "Ayer" },
          { v: "semana", l: "Semana" },
          { v: "mes", l: "Mes" },
        ].map(p => (
          <Button
            key={p.v}
            size="sm"
            variant={periodo === p.v ? "default" : "outline"}
            onClick={() => setPeriodo(p.v)}
            className="flex-1 text-xs"
          >
            {p.l}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-primary">{totalCount}</div>
          <div className="text-xs text-muted-foreground">Personas transportadas</div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
        </div>
      ) : (
        <div className="space-y-2">
          {validaciones.map(v => (
            <Card key={v.id}>
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {(v.empleados_empresa as any)?.nombre || "Empleado"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {(v.empleados_empresa as any)?.departamento || ""} · {v.turno || ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs">{v.fecha_local}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(v.validated_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {validaciones.length === 0 && (
            <div className="text-center text-muted-foreground py-6">
              <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin registros en este periodo</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
