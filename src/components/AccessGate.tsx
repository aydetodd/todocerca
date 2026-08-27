import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Smartphone, Loader2, LogOut, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getDeviceFingerprint, getDeviceName, getDeviceType } from "@/lib/deviceFingerprint";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** Motivo por el que se pide la validación */
  motivo: "dispositivo" | "sesion";
  /** Dispositivo donde estaba abierta la cuenta (si aplica) */
  sesionEn?: { device_name: string | null; device_type: string | null; last_seen_at: string } | null;
  onVerified: () => void;
}

/**
 * Validación única de acceso: un solo aviso, un solo código por correo.
 * Autoriza este dispositivo y deja la cuenta abierta únicamente aquí.
 */
export function AccessGate({ motivo, sesionEn, onVerified }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | "code">("intro");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [emailManual, setEmailManual] = useState("");
  const [emailGuardado, setEmailGuardado] = useState<string | null>(null);
  const [cargandoCorreo, setCargandoCorreo] = useState(true);
  const [editandoCorreo, setEditandoCorreo] = useState(false);
  const [error, setError] = useState("");

  const fp = getDeviceFingerprint();
  const deviceName = getDeviceName();
  const deviceType = getDeviceType();

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        let correo: string | null = auth.user?.email ?? null;
        if (uid) {
          const { data } = await supabase
            .from("profiles")
            .select("email")
            .eq("user_id", uid)
            .maybeSingle();
          if ((data as any)?.email) correo = (data as any).email;
        }
        if (correo?.toLowerCase().endsWith("@todocerca.app")) correo = null;
        if (!activo) return;
        setEmailGuardado(correo);
        setEmailManual(correo || "");
      } finally {
        if (activo) setCargandoCorreo(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);


  const requestCode = async () => {
    setError("");
    const correo = emailManual.trim();
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Escribe un correo válido");
      setEditandoCorreo(true);
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-device-verification", {
        body: {
          device_fingerprint: fp,
          device_name: deviceName,
          device_type: deviceType,
          email: correo,
        },
      });
      if (error) {
        let detalle = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const j = await error.context.json();
            if (j?.error) detalle = j.error;
          } catch (_) { /* ignorar */ }
        }
        throw new Error(detalle);
      }
      if (data?.error) throw new Error(data.error);
      setEmailGuardado(correo);
      setEditandoCorreo(false);
      setEmailMasked(data?.email_masked || correo);
      setStep("code");
      toast({ title: "Código enviado", description: "Revisa tu correo (y la carpeta de spam)" });

    } catch (e: any) {
      const msg = e?.message || "No se pudo enviar el correo";
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
      if (error) {
        let detalle = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const j = await error.context.json();
            if (j?.error) detalle = j.error;
          } catch (_) { /* ignorar */ }
        }
        throw new Error(detalle);
      }
      if (data?.error) throw new Error(data.error);
      toast({ title: "Acceso confirmado", description: "Tu cuenta quedó abierta solo en este dispositivo" });
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
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) await supabase.from("active_sessions").delete().eq("user_id", auth.user.id);
    } catch (_) { /* ignorar */ }
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const ultimaVez = sesionEn?.last_seen_at
    ? new Date(sesionEn.last_seen_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4 overflow-auto">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Confirma que eres tú</CardTitle>
          <CardDescription>
            Tu cuenta se abre en un solo dispositivo a la vez. Te enviamos un código por correo para
            dejarla abierta aquí.
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

          {motivo === "sesion" && sesionEn && (
            <div className="text-xs text-muted-foreground bg-muted/60 border border-border rounded-lg p-3">
              Tu cuenta está abierta en {sesionEn.device_name || "otro dispositivo"}
              {ultimaVez ? ` (última actividad: ${ultimaVez})` : ""}. Al confirmar el código, se cerrará
              ahí y quedará abierta aquí.
            </div>
          )}

          {step === "intro" && (
            <>
              {cargandoCorreo ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu correo...
                </div>
              ) : emailGuardado && !editandoCorreo ? (
                <div className="space-y-2">
                  <Label>Tu correo</Label>
                  <div className="p-3 rounded-lg bg-muted text-sm font-medium break-all">{emailGuardado}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email-acceso">Tu correo electrónico</Label>
                  <Input
                    id="email-acceso"
                    type="email"
                    inputMode="email"
                    autoFocus
                    value={emailManual}
                    onChange={(e) => setEmailManual(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este correo se guarda en tu cuenta y ahí llegarán siempre tus claves.
                  </p>
                </div>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button onClick={requestCode} disabled={sending || cargandoCorreo} className="w-full" size="lg">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Enviar código por correo
              </Button>
            </>
          )}


          {step === "code" && (
            <>
              <p className="text-sm text-muted-foreground">
                Enviamos un código de 6 dígitos a <span className="font-mono">{emailMasked}</span>. Vence
                en 10 minutos.
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">Código de verificación</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
                Confirmar y entrar
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
