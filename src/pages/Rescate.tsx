import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Lock, LogOut, KeyRound, LifeBuoy, Unlock } from "lucide-react";
import {
  RESCATE_MINUTOS,
  RescateSesion,
  guardarRescate,
  leerRescate,
  limpiarRescate,
  rescateBloquear,
  rescateCambiarClave,
  rescateCerrarTodo,
  rescateDesbloquear,
  rescateEntrar,
  rescateSolicitarCodigo,
} from "@/lib/rescate";

const Rescate = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sesion, setSesion] = useState<RescateSesion | null>(() => leerRescate());
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [loading, setLoading] = useState(false);
  const [restante, setRestante] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmClave, setConfirmClave] = useState("");
  const [mostrarCambio, setMostrarCambio] = useState(false);
  const [codigoDesbloqueo, setCodigoDesbloqueo] = useState("");
  const [emailMask, setEmailMask] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // Contador de 15 minutos: al vencer, la sesión de rescate muere sola
  useEffect(() => {
    if (!sesion) return;
    const tick = () => {
      const falta = RESCATE_MINUTOS * 60 * 1000 - (Date.now() - sesion.iniciada_en);
      if (falta <= 0) {
        limpiarRescate();
        setSesion(null);
        toast({ title: "Sesión de rescate terminada", description: "El teléfono prestado quedó limpio." });
        navigate("/home");
        return;
      }
      const m = Math.floor(falta / 60000);
      const s = Math.floor((falta % 60000) / 1000);
      setRestante(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    timerRef.current = window.setInterval(tick, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [sesion, navigate, toast]);

  const salir = () => {
    limpiarRescate();
    setSesion(null);
    navigate("/home");
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono || clave.length !== 5) {
      toast({ title: "Faltan datos", description: "Escribe tu teléfono y tu clave de 5 números", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await rescateEntrar(telefono, clave);
      const s: RescateSesion = {
        access_token: r.session.access_token,
        refresh_token: r.session.refresh_token,
        user_id: r.user_id,
        nombre: r.nombre,
        cuenta_bloqueada: r.cuenta_bloqueada,
        iniciada_en: Date.now(),
      };
      guardarRescate(s);
      setSesion(s);
    } catch (err) {
      toast({ title: "No se pudo entrar", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const accion = async (fn: () => Promise<unknown>, okMsg: string) => {
    setLoading(true);
    try {
      await fn();
      toast({ title: okMsg });
      return true;
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---------- Pantalla 1: entrar con teléfono + clave ----------
  if (!sesion) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 pb-40">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <LifeBuoy className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>¿Perdiste tu teléfono?</CardTitle>
            <CardDescription>
              Entra en modo rescate con tu teléfono y tu clave de 5 números. La sesión de este teléfono no se toca y la tuya se cierra sola en {RESCATE_MINUTOS} minutos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={entrar} className="space-y-4">
              <div className="space-y-2">
                <Label>Tu teléfono</Label>
                <PhoneInput value={telefono} onChange={setTelefono} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Tu clave de 5 números</Label>
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  value={clave}
                  onChange={(e) => setClave(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className="text-center text-2xl tracking-[0.5em]"
                  type="password"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Verificando..." : "Entrar en modo rescate"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(-1)}>
                Volver
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Pantalla 2: acciones de protección ----------
  return (
    <div className="min-h-screen bg-background p-4 pb-40">
      <div className="max-w-md mx-auto space-y-4">
        <div className="rounded-lg bg-destructive text-destructive-foreground p-3 text-center text-sm font-medium">
          Sesión de rescate en teléfono prestado. Se cerrará sola en {restante}.
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Proteger mi cuenta
            </CardTitle>
            <CardDescription>
              Hola {sesion.nombre}. En modo rescate no puedes gastar ni ver tu saldo: solo proteger tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sesion.cuenta_bloqueada ? (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm">
                Tu cuenta ya está <b>bloqueada</b>. Nadie puede usar tus tarjetas ni tu saldo.
              </div>
            ) : (
              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                disabled={loading}
                onClick={() =>
                  accion(async () => {
                    await rescateBloquear(sesion.access_token, "telefono_perdido");
                    const s = { ...sesion, cuenta_bloqueada: true };
                    guardarRescate(s);
                    setSesion(s);
                  }, "Cuenta bloqueada. Tus QR y tu saldo quedaron congelados.")
                }
              >
                <Lock className="mr-2 h-5 w-5" /> Bloquear mi cuenta
              </Button>
            )}

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={loading}
              onClick={() =>
                accion(async () => {
                  await rescateCerrarTodo(sesion.access_token);
                  limpiarRescate();
                  setSesion(null);
                  navigate("/home");
                }, "Se cerraron todas tus sesiones (incluido el teléfono perdido).")
              }
            >
              <LogOut className="mr-2 h-5 w-5" /> Cerrar sesión en todos mis dispositivos
            </Button>

            <Button variant="outline" size="lg" className="w-full" disabled={loading} onClick={() => setMostrarCambio((v) => !v)}>
              <KeyRound className="mr-2 h-5 w-5" /> Cambiar mi clave de 5 números
            </Button>

            {mostrarCambio && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <Label>Nueva clave</Label>
                  <Input
                    inputMode="numeric"
                    type="password"
                    maxLength={5}
                    value={nuevaClave}
                    onChange={(e) => setNuevaClave(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="text-center text-xl tracking-[0.5em]"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label>Confirmar clave</Label>
                  <Input
                    inputMode="numeric"
                    type="password"
                    maxLength={5}
                    value={confirmClave}
                    onChange={(e) => setConfirmClave(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="text-center text-xl tracking-[0.5em]"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={loading || nuevaClave.length !== 5 || nuevaClave !== confirmClave}
                  onClick={() =>
                    accion(async () => {
                      await rescateCambiarClave(sesion.access_token, nuevaClave);
                      setMostrarCambio(false);
                      setNuevaClave("");
                      setConfirmClave("");
                    }, "Tu clave cambió. La clave vieja ya no sirve.")
                  }
                >
                  Guardar nueva clave
                </Button>
              </div>
            )}

            {sesion.cuenta_bloqueada && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Unlock className="h-4 w-4" /> ¿Ya recuperaste tu teléfono?
                </p>
                {!emailMask ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={loading}
                    onClick={() =>
                      accion(async () => {
                        const r = await rescateSolicitarCodigo(sesion.access_token);
                        setEmailMask(r.email_mask || "tu correo");
                      }, "Te enviamos un código a tu correo.")
                    }
                  >
                    Enviar código de desbloqueo a mi correo
                  </Button>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Código enviado a {emailMask}</p>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={codigoDesbloqueo}
                      onChange={(e) => setCodigoDesbloqueo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="text-center text-xl tracking-[0.5em]"
                      autoFocus
                    />
                    <Button
                      className="w-full"
                      disabled={loading || codigoDesbloqueo.length !== 6}
                      onClick={async () => {
                        const ok = await accion(
                          () => rescateDesbloquear(sesion.access_token, codigoDesbloqueo),
                          "Cuenta desbloqueada. Ya puedes usarla normal."
                        );
                        if (ok) {
                          const s = { ...sesion, cuenta_bloqueada: false };
                          guardarRescate(s);
                          setSesion(s);
                        }
                      }}
                    >
                      Desbloquear mi cuenta
                    </Button>
                  </>
                )}
              </div>
            )}

            <Button variant="ghost" className="w-full" onClick={salir}>
              Salir del modo rescate
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Rescate;
