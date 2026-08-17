import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

import { ShieldCheck } from "lucide-react";
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

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("clave_universal_migrada")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelado && data && data.clave_universal_migrada === false) setOpen(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);

  const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, CLAVE_LENGTH);

  async function guardar() {
    if (!user) return;
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
