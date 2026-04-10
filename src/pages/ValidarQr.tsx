import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QrCode, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Volume2, VolumeX, Keyboard, Camera, Download, X, Map as MapIcon, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csvExport";
import { getHermosilloToday, getHermosilloTodayStart } from "@/lib/utils";
import { Html5Qrcode } from "html5-qrcode";
import { DriverMiniMap } from "@/components/DriverMiniMap";

type ValidationResult = {
  valid: boolean;
  error_type?: string;
  severity?: string;
  message: string;
  fraud_details?: {
    used_at: string;
    used_on_unit: string;
    used_on_plates: string;
    used_on_route: string | null;
    minutes_elapsed: number;
    distance_km: number | null;
    is_same_unit: boolean;
    short_code: string;
    total_user_attempts: number;
  };
  details?: {
    amount?: number;
    short_code: string;
    validated_at: string;
    daily_passenger_count: number;
    daily_total_mxn?: number;
    employee_name?: string;
    employee_id?: string;
    department?: string;
    shift?: string;
    company_name?: string;
    qr_type?: string;
  };
};

// Alert beep using Web Audio API
const playAlertBeep = (type: "success" | "fraud" | "error") => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "fraud") {
      osc.frequency.value = 400;
      osc.type = "square";
      gain.gain.setValueAtTime(1.0, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      // Second beep
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 300;
        osc2.type = "square";
        gain2.gain.setValueAtTime(1.0, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.5);
      }, 550);
    } else {
      osc.frequency.value = 200;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
};

export default function ValidarQr() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const choferParam = searchParams.get("chofer"); // chofer_empresa.id from URL
  const [qrInput, setQrInput] = useState("");
  const [scanMode, setScanMode] = useState<"boleto" | "personal">("boleto");
  const [lastResultType, setLastResultType] = useState<"boleto" | "personal" | null>(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [dailyPersonalCount, setDailyPersonalCount] = useState(0);
  const [assignedUnitId, setAssignedUnitId] = useState<string | null>(null);
  const [assignedRouteId, setAssignedRouteId] = useState<string | null>(null);
  const [isPrivateRoute, setIsPrivateRoute] = useState(false);
  const [showTicketList, setShowTicketList] = useState(false);
  const [dailyTickets, setDailyTickets] = useState<{ short_code: string; time: string }[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);

  // Load driver's assigned unit and initial daily stats
  useEffect(() => {
    if (!authLoading && user) {
      setTimeout(() => inputRef.current?.focus(), 300);
      loadDriverAssignment();
    }
  }, [authLoading, user]);

  const loadDriverAssignment = async () => {
    if (!user) return;
    try {
      const todayStr = getHermosilloToday();
      const todayStart = getHermosilloTodayStart();

      // Find the specific chofer record (by URL param or first active)
      let choferQuery = supabase
        .from("choferes_empresa")
        .select("id, proveedor_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (choferParam) {
        choferQuery = choferQuery.eq("id", choferParam);
      }

      const { data: chofer } = await choferQuery.limit(1).single();

      if (chofer) {
        // Find today's assignment for this specific driver record
        const { data: asignacion } = await supabase
          .from("asignaciones_chofer")
          .select("unidad_id, producto_id")
          .eq("chofer_id", chofer.id)
          .eq("fecha", todayStr)
          .limit(1)
          .single();

        if (asignacion) {
          setAssignedUnitId(asignacion.unidad_id);
          setAssignedRouteId(asignacion.producto_id);

          // Check if this is a private route
          if (asignacion.producto_id) {
            const { data: producto } = await supabase
              .from("productos")
              .select("route_type")
              .eq("id", asignacion.producto_id)
              .single();
            if (producto?.route_type === "privada") {
              setIsPrivateRoute(true);
              setScanMode("personal");
            }
          }
        }
      }

      // Load public ticket stats (only for this driver + route)
      const ticketQuery = supabase
        .from("logs_validacion_qr")
        .select("*", { count: "exact", head: true })
        .eq("chofer_id", user.id)
        .eq("resultado", "valid")
        .gte("created_at", todayStart);

      const { count } = await ticketQuery;
      const c = count ?? 0;
      setDailyCount(c);
      setDailyTotal(c * 9);

      // Load employee validation stats for today
      const { count: personalCount } = await supabase
        .from("validaciones_transporte_personal")
        .select("*", { count: "exact", head: true })
        .eq("chofer_id", user.id)
        .eq("fecha_local", todayStr);

      setDailyPersonalCount(personalCount ?? 0);
    } catch (err) {
      console.error("Error loading driver assignment:", err);
    }
  };

  const loadDailyTickets = async () => {
    if (!user) return;
    setLoadingTickets(true);
    try {
      const todayStr = getHermosilloToday();
      const todayStart = getHermosilloTodayStart();

      const { data } = await (supabase
        .from("logs_validacion_qr") as any)
        .select("qr_ticket_id, created_at, qr_tickets(token)")
        .eq("chofer_id", user.id)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        setDailyTickets(data.map((d: any) => ({
          short_code: (d.qr_tickets?.token || d.qr_ticket_id || "").slice(-6).toUpperCase(),
          time: new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        })));
      } else {
        setDailyTickets([]);
      }
    } catch (err) {
      console.error("Error loading daily tickets:", err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!user) return;
    try {
      const todayStr = getHermosilloToday();
      const todayStart = getHermosilloTodayStart();

      const { data } = await (supabase
        .from("logs_validacion_qr") as any)
        .select("qr_ticket_id, created_at, unidad_id, qr_tickets(token)")
        .eq("chofer_id", user.id)
        .eq("resultado", "valid")
        .gte("created_at", todayStart)
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) {
        toast.info("No hay boletos para exportar");
        return;
      }

      const rows = data.map((d: any, i: number) => [
        String(i + 1),
        (d.qr_tickets?.token || d.qr_ticket_id || "").slice(-6).toUpperCase(),
        new Date(d.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        "$9.00",
      ]);

      downloadCSV(
        `boletos-chofer-${todayStr}.csv`,
        ["#", "Código", "Hora", "Monto"],
        rows
      );
      toast.success("CSV descargado");
    } catch (err) {
      console.error("CSV export error:", err);
      toast.error("Error al exportar CSV");
    }
  };

  const toggleTicketList = () => {
    if (!showTicketList) loadDailyTickets();
    setShowTicketList(!showTicketList);
  };

  // Cleanup flash timer and camera
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearInterval(flashTimerRef.current);
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const openCamera = useCallback(async () => {
    setCameraOpen(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-camera-reader");
        html5QrRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (html5QrRef.current) {
              html5QrRef.current.stop().catch(() => {});
              html5QrRef.current = null;
            }
            setCameraOpen(false);
            handleValidateToken(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Camera error:", err);
        toast.error("No se pudo acceder a la cámara");
        setCameraOpen(false);
      }
    }, 100);
  }, []);

  const closeCamera = useCallback(() => {
    if (html5QrRef.current) {
      html5QrRef.current.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  const startFlashing = useCallback(() => {
    setFlashing(true);
    let count = 0;
    flashTimerRef.current = setInterval(() => {
      count++;
      setFlashing((prev) => !prev);
      if (count >= 10) {
        if (flashTimerRef.current) clearInterval(flashTimerRef.current);
        setFlashing(false);
      }
    }, 500);
  }, []);

  const handleValidateToken = async (directToken?: string) => {
    const token = (directToken || qrInput).trim();
    if (!token || validating) return;

    setValidating(true);
    setResult(null);
    if (flashTimerRef.current) {
      clearInterval(flashTimerRef.current);
      setFlashing(false);
    }

    try {
      // Get current position
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        // Continue without location
      }

      const primaryFn = scanMode === "personal" ? "validar-qr-empleado" : "validate-qr-ticket";
      const fallbackFn = scanMode === "personal" ? "validate-qr-ticket" : "validar-qr-empleado";
      const reqBody = { qr_token: token, latitude, longitude, unidad_id: assignedUnitId, ruta_id: assignedRouteId };

      const { data: primaryData, error: primaryError } = await supabase.functions.invoke(primaryFn, { body: reqBody });
      if (primaryError) throw primaryError;

      let data = primaryData;

      // If primary says invalid (not fraud), try the other function automatically
      if (!data?.valid && data?.error_type !== "fraud") {
        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke(fallbackFn, { body: reqBody });
        if (!fallbackError && fallbackData && (fallbackData.valid || fallbackData.error_type !== "invalid")) {
          data = fallbackData;
        }
      }

      const res = data as ValidationResult;
      setResult(res);

      if (res.valid && res.details) {
        // SUCCESS
        setDailyCount(res.details.daily_passenger_count);
        setDailyTotal(typeof res.details.daily_total_mxn === "number" ? res.details.daily_total_mxn : 0);

        if (audioEnabled) {
          playAlertBeep("success");
        }

        if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
      } else if (res.error_type === "fraud" && res.fraud_details) {
        // FRAUD
        startFlashing();

        if (audioEnabled) {
          playAlertBeep("fraud");
        }
        if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500]);
      } else {
        // Other errors
        if (audioEnabled) {
          playAlertBeep("error");
        }
      }
    } catch (err: any) {
      console.error("Validation error:", err);
      toast.error("Error al validar QR");
      if (audioEnabled) {
        playAlertBeep("error");
      }
    } finally {
      setValidating(false);
      setQrInput("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleValidateToken();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  const severityColor = (s?: string) => {
    switch (s) {
      case "critical": return "bg-red-900 text-red-100";
      case "high": return "bg-red-700 text-red-100";
      case "medium": return "bg-orange-600 text-orange-100";
      default: return "bg-yellow-600 text-yellow-100";
    }
  };

  const severityLabel = (s?: string) => {
    switch (s) {
      case "critical": return "CRÍTICA";
      case "high": return "ALTA";
      case "medium": return "MEDIA";
      default: return "BAJA";
    }
  };

  const isPersonalMode = scanMode === "personal";

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden transition-colors duration-300 ${
        flashing ? "bg-red-600" : result?.error_type === "fraud" ? "bg-red-950" : "bg-background"
      }`}
    >
      {/* Compact Header */}
      <div className="shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BackButton />
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {scanMode === "personal" ? "Transporte Personal" : "Validar QR Boleto"}
              </h1>
              <p className="text-[10px] text-muted-foreground">
                {scanMode === "personal" ? "Modo maquiladora" : "Escáner de chofer"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={scanMode === "personal" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setScanMode(scanMode === "boleto" ? "personal" : "boleto")}
              title={scanMode === "personal" ? "Modo: Transporte Personal" : "Cambiar a Transporte Personal"}
            >
              <Building2 className="h-4 w-4" />
            </Button>
            <Button
              variant={showMap ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowMap(!showMap)}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setAudioEnabled(!audioEnabled)}
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Top Half: Map */}
      {showMap && (
        <div className="shrink-0 h-[40vh] border-b border-border">
          <DriverMiniMap routeProductId={assignedRouteId} />
        </div>
      )}

      {/* Bottom Half: Scanner - scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-28">
        {/* Compact Daily Stats */}
        <div
          className={`grid gap-2 ${isPersonalMode ? "grid-cols-1" : "grid-cols-2 cursor-pointer"}`}
          onClick={isPersonalMode ? undefined : toggleTicketList}
        >
          <Card>
            <CardContent className="p-2 text-center">
              <p className="text-2xl font-bold text-foreground">{dailyCount}</p>
              <p className="text-[10px] text-muted-foreground">Pasajeros hoy</p>
            </CardContent>
          </Card>
          {!isPersonalMode && (
            <Card>
              <CardContent className="p-2 text-center">
                <p className="text-2xl font-bold text-foreground">${dailyTotal.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">Recaudado hoy</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Ticket List */}
        {!isPersonalMode && showTicketList && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Boletos validados hoy</p>
                <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="h-7 text-xs gap-1">
                  <Download className="h-3 w-3" /> CSV
                </Button>
              </div>
              {loadingTickets ? (
                <p className="text-xs text-muted-foreground text-center py-2">Cargando...</p>
              ) : dailyTickets.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Sin boletos validados</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {dailyTickets.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                      <span className="font-mono text-sm font-bold text-foreground">#{t.short_code}</span>
                      <span className="text-xs text-muted-foreground">{t.time}</span>
                      <span className="text-xs font-semibold text-primary">$9.00</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Camera Scanner */}
        {cameraOpen && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">📷 Escaneando...</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeCamera}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div id="qr-camera-reader" className="w-full rounded-lg overflow-hidden" />
            </CardContent>
          </Card>
        )}

        {/* QR Input */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isPersonalMode ? "Token del empleado QR..." : "Token del boleto QR..."}
                className="font-mono text-base"
                autoComplete="off"
                autoFocus
              />
              <Button
                onClick={() => handleValidateToken()}
                disabled={!qrInput.trim() || validating}
                size="default"
                className="px-3"
              >
                {validating ? (
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={cameraOpen ? closeCamera : openCamera}
                variant={cameraOpen ? "destructive" : "outline"}
                size="default"
                className="px-3"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Lector QR, código manual o cámara 📷
            </p>
          </CardContent>
        </Card>

        {/* Result Display */}
        {result && (
          <>
            {/* VALID */}
            {result.valid && result.details && (
              <Card className="border-green-500 border-2 bg-green-500/10">
                <CardContent className="p-4 text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <h2 className="text-xl font-bold text-green-600">
                    {result.details.employee_name ? "✓ EMPLEADO REGISTRADO" : "✓ VÁLIDO"}
                  </h2>
                  <p className="font-mono text-lg font-bold text-foreground">
                    #{result.details.short_code}
                  </p>
                  {result.details.employee_name ? (
                    <>
                      <div className="space-y-1 text-sm text-foreground">
                        <p className="font-semibold">{result.details.employee_name}</p>
                        {result.details.company_name && (
                          <p className="text-muted-foreground">{result.details.company_name}</p>
                        )}
                        {(result.details.department || result.details.shift) && (
                          <p className="text-muted-foreground">
                            {[result.details.department, result.details.shift].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="bg-card rounded-lg p-2">
                          <p className="text-xl font-bold text-foreground">#{result.details.daily_passenger_count}</p>
                          <p className="text-[10px] text-muted-foreground">Pasajeros registrados hoy</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-card rounded-lg p-2">
                        <p className="text-xl font-bold text-foreground">${(result.details.amount ?? 0).toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">Valor</p>
                      </div>
                      <div className="bg-card rounded-lg p-2">
                        <p className="text-xl font-bold text-foreground">#{result.details.daily_passenger_count}</p>
                        <p className="text-[10px] text-muted-foreground">Pasajero del día</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* FRAUD */}
            {result.error_type === "fraud" && result.fraud_details && (
              <Card
                className={`border-4 ${
                  flashing ? "border-white bg-red-800" : "border-red-500 bg-red-900/90"
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="text-center">
                    <ShieldAlert
                      className={`h-16 w-16 mx-auto ${
                        flashing ? "text-white" : "text-red-400"
                      } animate-pulse`}
                    />
                    <h2 className="text-xl font-bold text-white mt-2">⚠️ FRAUDE</h2>
                    <Badge className={`mt-1 text-sm px-3 py-0.5 ${severityColor(result.severity)}`}>
                      {severityLabel(result.severity)}
                    </Badge>
                  </div>
                  <div className="bg-red-950/80 rounded-lg p-3 space-y-1.5 text-xs">
                    <p className="text-red-200">
                      <strong className="text-white">Código:</strong>{" "}
                      <span className="font-mono text-base">#{result.fraud_details.short_code}</span>
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Usado:</strong>{" "}
                      {new Date(result.fraud_details.used_at).toLocaleString("es-MX", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Unidad:</strong>{" "}
                      {result.fraud_details.used_on_unit}
                      {result.fraud_details.used_on_plates && ` (${result.fraud_details.used_on_plates})`}
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Hace:</strong> {result.fraud_details.minutes_elapsed} min
                    </p>
                    {result.fraud_details.distance_km !== null && (
                      <p className="text-red-200">
                        <strong className="text-white">Distancia:</strong> {result.fraud_details.distance_km} km
                      </p>
                    )}
                    <p className="text-red-200">
                      <strong className="text-white">Intentos:</strong>{" "}
                      <span className="text-red-300 font-bold text-base">{result.fraud_details.total_user_attempts}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* OTHER ERRORS */}
            {!result.valid && result.error_type !== "fraud" && (
              <Card className="border-amber-500 border-2 bg-amber-500/10">
                <CardContent className="p-4 text-center space-y-2">
                  {result.error_type === "expired_transfer" ? (
                    <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
                  ) : (
                    <XCircle className="h-12 w-12 mx-auto text-amber-500" />
                  )}
                  <h2 className="text-lg font-bold text-amber-600">NO VÁLIDO</h2>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Idle state - only when no map */}
        {!result && !validating && !showMap && (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground space-y-2">
              <QrCode className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm font-medium text-foreground">Listo para escanear</p>
              <p className="text-xs">Conecte un lector QR o ingrese el código.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
