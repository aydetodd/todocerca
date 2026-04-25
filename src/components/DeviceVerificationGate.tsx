import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Smartphone, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint, getDeviceName, getDeviceType } from "@/lib/deviceFingerprint";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onVerified: () => void;
}

export function DeviceVerificationGate({ onVerified }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | "code">("intro");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [error, setError] = useState("");

  const fp = getDeviceFingerprint();
  const deviceName = getDeviceName();
  const deviceType = getDeviceType();

  const requestCode = async () => {
    setError("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-device-verification", {
        body: { device_fingerprint: fp, device_name: deviceName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPhoneMasked(data?.phone_masked || "");
      setStep("code");
      toast({ title: "Código enviado", description: "Revisa los SMS de tu teléfono registrado" });
    } catch (e: any) {
      const msg = e?.message || "No se pudo enviar el SMS";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const submitCode = async () => {
    if (code.length !== 6) {
      setError("Ingresa el código de 6 dígitos");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-device", {
        body: {
          device_fingerprint: fp,
          device_name: deviceName,
          device_type: deviceType,
          user_agent: navigator.userAgent,
          code,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Dispositivo autorizado", description: "Ya puedes usar TodoCerca aquí" });
      onVerified();
    } catch (e: any) {
      const msg = e?.message || "Código incorrecto";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4 overflow-auto">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Autoriza este dispositivo</CardTitle>
          <CardDescription>
            Por seguridad, necesitamos verificar que este teléfono te pertenece.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <div className="font-medium">{deviceName}</div>
              <div className="text-xs text-muted-foreground capitalize">{deviceType}</div>
            </div>
          </div>

          {step === "intro" && (
            <>
              <p className="text-sm text-muted-foreground">
                Te enviaremos un código por SMS al número de teléfono registrado en tu cuenta.
                Si ya no tienes acceso a ese número, contacta a soporte.
              </p>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button onClick={requestCode} disabled={sending} className="w-full" size="lg">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Enviar código por SMS
              </Button>
            </>
          )}

          {step === "code" && (
            <>
              <p className="text-sm text-muted-foreground">
                Enviamos un código de 6 dígitos a <span className="font-mono">{phoneMasked}</span>.
                Vence en 10 minutos.
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">Código de verificación</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button onClick={submitCode} disabled={verifying || code.length !== 6} className="w-full" size="lg">
                {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Verificar y autorizar
              </Button>
              <Button onClick={requestCode} variant="ghost" disabled={sending} className="w-full">
                Reenviar código
              </Button>
            </>
          )}

          <Button onClick={signOut} variant="outline" className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
