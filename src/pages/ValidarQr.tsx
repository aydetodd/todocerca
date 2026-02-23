import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Volume2, VolumeX, Keyboard, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    amount: number;
    short_code: string;
    validated_at: string;
    daily_passenger_count: number;
    daily_total_mxn: number;
  };
};

// TTS helper
const speak = (message: string, rate = 0.9) => {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(message);
  u.lang = "es-MX";
  u.rate = rate;
  u.pitch = 0.9;
  u.volume = 1.0;
  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(
      (v) =>
        v.lang.startsWith("es") &&
        (v.name.includes("Paulina") || v.name.includes("Monica") || v.name.includes("Francisca"))
    ) || voices.find((v) => v.lang.startsWith("es"));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length > 0) setVoice();
  else window.speechSynthesis.onvoiceschanged = setVoice;
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
  const [qrInput, setQrInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus input
  useEffect(() => {
    if (!authLoading && user) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [authLoading, user]);

  // Cleanup flash timer
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearInterval(flashTimerRef.current);
    };
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

  const handleValidate = async () => {
    const token = qrInput.trim();
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

      const { data, error } = await supabase.functions.invoke("validate-qr-ticket", {
        body: { qr_token: token, latitude, longitude },
      });

      if (error) throw error;

      const res = data as ValidationResult;
      setResult(res);

      if (res.valid && res.details) {
        // SUCCESS
        setDailyCount(res.details.daily_passenger_count);
        setDailyTotal(res.details.daily_total_mxn);

        if (audioEnabled) {
          playAlertBeep("success");
          setTimeout(() => {
            speak(
              `Boleto válido. Código ${res.details!.short_code.split("").join(" ")}. ` +
              `Pasajero número ${res.details!.daily_passenger_count} del día. ` +
              `Acumulado: ${res.details!.daily_total_mxn} pesos.`,
              0.95
            );
          }, 400);
        }

        if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
      } else if (res.error_type === "fraud" && res.fraud_details) {
        // FRAUD
        startFlashing();

        if (audioEnabled) {
          playAlertBeep("fraud");
          if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500]);

          setTimeout(() => {
            const fd = res.fraud_details!;
            const usedDate = new Date(fd.used_at);
            const dateStr = usedDate.toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
            });
            const timeStr = usedDate.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            });

            let msg = `¡Alerta de fraude! Boleto ya utilizado. `;
            msg += `Código ${fd.short_code.split("").join(" ")}. `;
            msg += `Fue usado el ${dateStr} a las ${timeStr}. `;
            msg += `En la unidad ${fd.used_on_unit}. `;
            msg += `Hace ${fd.minutes_elapsed} minutos. `;
            if (fd.distance_km !== null) {
              msg += `A ${fd.distance_km} kilómetros de aquí. `;
            }
            msg += `Severidad: ${
              res.severity === "critical"
                ? "Crítica"
                : res.severity === "high"
                ? "Alta"
                : res.severity === "medium"
                ? "Media"
                : "Baja"
            }. `;
            msg += `Este usuario tiene ${fd.total_user_attempts} intentos de fraude registrados.`;

            speak(msg, 0.85);
          }, 1200);
        }
      } else {
        // Other errors
        if (audioEnabled) {
          playAlertBeep("error");
          setTimeout(() => speak(res.message, 0.95), 400);
        }
      }
    } catch (err: any) {
      console.error("Validation error:", err);
      toast.error("Error al validar QR");
      if (audioEnabled) {
        playAlertBeep("error");
        setTimeout(() => speak("Error al validar el boleto. Intente de nuevo.", 0.95), 400);
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
      handleValidate();
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

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        flashing ? "bg-red-600" : result?.error_type === "fraud" ? "bg-red-950" : "bg-background"
      }`}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-lg font-bold text-foreground">Validar QR Boleto</h1>
              <p className="text-xs text-muted-foreground">Escáner de chofer</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="text-muted-foreground"
          >
            {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Daily Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-3xl font-bold text-foreground">{dailyCount}</p>
              <p className="text-xs text-muted-foreground">Pasajeros hoy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-3xl font-bold text-foreground">${dailyTotal.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Recaudado hoy</p>
            </CardContent>
          </Card>
        </div>

        {/* QR Input */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Keyboard className="h-4 w-4" />
              <span className="text-sm font-medium">Ingrese o escanee el código QR</span>
            </div>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Token del boleto QR..."
                className="font-mono text-lg"
                autoComplete="off"
                autoFocus
              />
              <Button
                onClick={handleValidate}
                disabled={!qrInput.trim() || validating}
                size="lg"
                className="px-6"
              >
                {validating ? (
                  <div className="animate-spin h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full" />
                ) : (
                  <QrCode className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Use un lector QR externo o escriba el código manualmente
            </p>
          </CardContent>
        </Card>

        {/* Result Display */}
        {result && (
          <>
            {/* VALID */}
            {result.valid && result.details && (
              <Card className="border-green-500 border-2 bg-green-500/10">
                <CardContent className="p-6 text-center space-y-3">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
                  <h2 className="text-2xl font-bold text-green-600">✓ BOLETO VÁLIDO</h2>
                  <p className="font-mono text-xl font-bold text-foreground">
                    #{result.details.short_code}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">
                        ${result.details.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Valor</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-2xl font-bold text-foreground">
                        #{result.details.daily_passenger_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Pasajero del día</p>
                    </div>
                  </div>
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
                <CardContent className="p-6 space-y-4">
                  <div className="text-center">
                    <ShieldAlert
                      className={`h-20 w-20 mx-auto ${
                        flashing ? "text-white" : "text-red-400"
                      } animate-pulse`}
                    />
                    <h2 className="text-2xl font-bold text-white mt-3">
                      ⚠️ ALERTA DE FRAUDE
                    </h2>
                    <Badge className={`mt-2 text-base px-4 py-1 ${severityColor(result.severity)}`}>
                      Severidad: {severityLabel(result.severity)}
                    </Badge>
                  </div>

                  <div className="bg-red-950/80 rounded-lg p-4 space-y-2 text-sm">
                    <p className="text-red-200">
                      <strong className="text-white">Código:</strong>{" "}
                      <span className="font-mono text-lg">#{result.fraud_details.short_code}</span>
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Usado originalmente:</strong>{" "}
                      {new Date(result.fraud_details.used_at).toLocaleString("es-MX", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Unidad original:</strong>{" "}
                      {result.fraud_details.used_on_unit}
                      {result.fraud_details.used_on_plates &&
                        ` (${result.fraud_details.used_on_plates})`}
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Tiempo transcurrido:</strong>{" "}
                      {result.fraud_details.minutes_elapsed} min
                    </p>
                    {result.fraud_details.distance_km !== null && (
                      <p className="text-red-200">
                        <strong className="text-white">Distancia:</strong>{" "}
                        {result.fraud_details.distance_km} km
                      </p>
                    )}
                    <p className="text-red-200">
                      <strong className="text-white">Intentos del usuario:</strong>{" "}
                      <span className="text-red-300 font-bold text-lg">
                        {result.fraud_details.total_user_attempts}
                      </span>
                    </p>
                    <p className="text-red-200">
                      <strong className="text-white">Misma unidad:</strong>{" "}
                      {result.fraud_details.is_same_unit ? "Sí" : "No"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* OTHER ERRORS */}
            {!result.valid && result.error_type !== "fraud" && (
              <Card className="border-amber-500 border-2 bg-amber-500/10">
                <CardContent className="p-6 text-center space-y-3">
                  {result.error_type === "expired_transfer" ? (
                    <AlertTriangle className="h-16 w-16 mx-auto text-amber-500" />
                  ) : (
                    <XCircle className="h-16 w-16 mx-auto text-amber-500" />
                  )}
                  <h2 className="text-xl font-bold text-amber-600">BOLETO NO VÁLIDO</h2>
                  <p className="text-muted-foreground">{result.message}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Instructions when idle */}
        {!result && !validating && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground space-y-2">
              <QrCode className="h-12 w-12 mx-auto opacity-30" />
              <p className="font-medium text-foreground">Listo para escanear</p>
              <p className="text-sm">
                Conecte un lector QR USB/Bluetooth o ingrese el código manualmente.
                El lector enviará el código automáticamente al campo de texto.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
