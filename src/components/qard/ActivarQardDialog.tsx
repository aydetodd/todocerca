import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Check, ShieldCheck, Loader2 } from "lucide-react";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneVerified: boolean;
  emailVerified: boolean;
  onActivada: () => void;
};

async function llamar(accion: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("qard-identidad", {
    body: { accion, ...extra },
  });
  if (error) {
    const detalle = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
    let msg = detalle;
    try { msg = JSON.parse(detalle).error ?? detalle; } catch { /* texto plano */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function ActivarQardDialog({ open, onOpenChange, phoneVerified, emailVerified, onActivada }: Props) {
  const [paso, setPaso] = useState<1 | 2 | 3>(phoneVerified ? (emailVerified ? 3 : 2) : 1);
  const [ocupado, setOcupado] = useState(false);
  const [codigoSms, setCodigoSms] = useState("");
  const [correo, setCorreo] = useState("");
  const [codigoCorreo, setCodigoCorreo] = useState("");
  const [nombre, setNombre] = useState("");
  const [curp, setCurp] = useState("");

  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); }
    catch (e: any) { toast({ title: "No se pudo continuar", description: e.message, variant: "destructive" }); }
    finally { setOcupado(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Activar mi QaRd
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map(n => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${paso >= n ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {paso === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 1 de 3: te mandamos un código de 6 dígitos a tu teléfono registrado.
            </p>
            <Button
              variant="outline"
              className="w-full"
              disabled={ocupado}
              onClick={() => ejecutar(async () => {
                await llamar("enviar_sms");
                toast({ title: "Código enviado", description: "Revisa tus mensajes (SMS o buzón de TodoCerca)." });
              })}
            >
              Enviar código
            </Button>
            <div>
              <Label className="text-xs">Código recibido</Label>
              <Input inputMode="numeric" maxLength={6} placeholder="123456"
                value={codigoSms} onChange={e => setCodigoSms(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <Button
              className="w-full" disabled={ocupado || codigoSms.length !== 6}
              onClick={() => ejecutar(async () => {
                await llamar("verificar_sms", { code: codigoSms });
                toast({ title: "Teléfono verificado" });
                setPaso(2);
              })}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar teléfono"}
            </Button>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 2 de 3: verifica tu correo. El código dura 7 días.
            </p>
            <div>
              <Label className="text-xs">Tu correo</Label>
              <Input type="email" placeholder="tucorreo@ejemplo.com"
                value={correo} onChange={e => setCorreo(e.target.value)} />
            </div>
            <Button
              variant="outline" className="w-full" disabled={ocupado || !correo.includes("@")}
              onClick={() => ejecutar(async () => {
                await llamar("enviar_correo", { email: correo.trim() });
                toast({ title: "Código enviado", description: "Revisa tu correo y tu buzón de TodoCerca." });
              })}
            >
              Enviar código al correo
            </Button>
            <div>
              <Label className="text-xs">Código recibido</Label>
              <Input inputMode="numeric" maxLength={6} placeholder="123456"
                value={codigoCorreo} onChange={e => setCodigoCorreo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <Button
              className="w-full" disabled={ocupado || codigoCorreo.length !== 6}
              onClick={() => ejecutar(async () => {
                await llamar("verificar_correo", { code: codigoCorreo });
                toast({ title: "Correo verificado" });
                setPaso(3);
              })}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar correo"}
            </Button>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 3 de 3: tus datos legales. Solo se usan en pantallas de dinero; en chats y mapas
              seguirás apareciendo con tu apodo.
            </p>
            <div>
              <Label className="text-xs">Nombre completo</Label>
              <Input placeholder="Como aparece en tu identificación"
                value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">CURP (18 caracteres)</Label>
              <Input maxLength={18} className="font-mono uppercase"
                value={curp} onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-ZÑ0-9]/g, "").slice(0, 18))} />
              {curp.length === 18 && !validarCurp(curp) && (
                <p className="text-xs text-destructive mt-1">{MENSAJE_CURP_INVALIDA}</p>
              )}
            </div>
            <Button
              className="w-full" disabled={ocupado || nombre.trim().length < 5 || !validarCurp(curp)}
              onClick={() => ejecutar(async () => {
                await llamar("activar", { nombre_completo: nombre.trim(), curp });
                toast({ title: "¡Tu QaRd está ACTIVA!", description: "Ya puedes recargar, pagar y transferir." });
                onActivada();
                onOpenChange(false);
              })}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Check className="h-4 w-4 mr-1" /> Activar mi QaRd</>)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
