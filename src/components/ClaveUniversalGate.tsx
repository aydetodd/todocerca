import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

import { Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CLAVE_LENGTH, claveToPassword, esClaveUniversal } from "@/lib/claveUniversal";

/** Obliga a los usuarios ya registrados a cambiar su contraseña por la clave de 5 números. */
export const ClaveUniversalGate = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [correoVerificado, setCorreoVerificado] = useState(false);
  const [requiereCorreo, setRequiereCorreo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("clave_universal_migrada, email, recovery_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelado && data && data.clave_universal_migrada === false) {
        const authUsaCorreoInterno = !!user.email?.toLowerCase().endsWith("@todocerca.app");
        const correoReal = data.recovery_email || (data.email?.toLowerCase().endsWith("@todocerca.app") ? "" : data.email) || "";
        setCorreo(correoReal);
        setCorreoVerificado(!authUsaCorreoInterno && !!correoReal);
        setRequiereCorreo(authUsaCorreoInterno || !correoReal);
        setOpen(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);

  const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, CLAVE_LENGTH);

  async function enviarCodigo() {
    const limpio = correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) || limpio.endsWith("@todocerca.app")) {
      toast({ title: "Correo inválido", description: "Escribe el correo real que usarás para entrar y recuperar tu cuenta.", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("qard-identidad", { body: { accion: "enviar_correo", email: limpio } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Código enviado", description: "Revisa tu correo." });
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function verificarCorreo() {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("qard-identidad", { body: { accion: "verificar_correo", code: codigo } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setCorreoVerificado(true);
      toast({ title: "Correo guardado", description: "Este será tu correo de acceso y recuperación." });
    } catch (e: any) {
      toast({ title: "Código incorrecto", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function guardar() {
    if (!user) return;
    if (requiereCorreo && !correoVerificado) {
      toast({ title: "Falta verificar el correo", description: "Primero confirma el código que te enviamos.", variant: "destructive" });
      return;
    }
    if (!esClaveUniversal(clave)) {
      toast({ title: "Clave incompleta", description: "Deben ser 5 números.", variant: "destructive" });
      return;
    }
    if (clave !== confirmar) {
      toast({ title: "No coinciden", description: "Escribe la misma clave dos veces.", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: claveToPassword(clave) });
      if (error) throw error;
      const { error: perfilError } = await supabase
        .from("profiles")
        .update({ clave_universal_migrada: true })
        .eq("user_id", user.id);
      if (perfilError) throw perfilError;
      toast({
        title: "Clave actualizada",
        description: "Desde ahora entras con tus 5 números.",
      });
      setOpen(false);
      setClave("");
      setConfirmar("");
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Actualización de seguridad
          </DialogTitle>
          <DialogDescription>
            Ahora tu contraseña son 5 números. Los mismos 5 números sirven para entrar, abrir geocercas y
            activar el SOS.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {requiereCorreo && !correoVerificado && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div>
                <Label htmlFor="correo-migracion">Correo que usarás en esta cuenta</Label>
                <Input id="correo-migracion" type="email" inputMode="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoFocus />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={enviarCodigo} disabled={enviando}>
                <Mail className="h-4 w-4 mr-2" /> {enviando ? "Enviando..." : "Enviar código"}
              </Button>
              <div>
                <Label htmlFor="codigo-correo-migracion">Código recibido</Label>
                <Input id="codigo-correo-migracion" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              </div>
              <Button type="button" className="w-full" onClick={verificarCorreo} disabled={enviando || codigo.length !== 6}>
                Confirmar correo
              </Button>
            </div>
          )}
          <div>
            <Label>Tu clave de 5 números</Label>
            <div className="flex justify-center py-2">
              <InputOTP maxLength={CLAVE_LENGTH} value={clave} onChange={(v) => setClave(soloDigitos(v))} inputMode="numeric" autoFocus>
                <InputOTPGroup>
                  {Array.from({ length: CLAVE_LENGTH }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div>
            <Label>Repite tu clave</Label>
            <div className="flex justify-center py-2">
              <InputOTP maxLength={CLAVE_LENGTH} value={confirmar} onChange={(v) => setConfirmar(soloDigitos(v))} inputMode="numeric">
                <InputOTPGroup>
                  {Array.from({ length: CLAVE_LENGTH }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button className="w-full" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar mi clave"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
