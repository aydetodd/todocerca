import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Check, ShieldCheck, Loader2, ExternalLink } from "lucide-react";
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

export default function ActivarQardDialog({ open, onOpenChange, emailVerified, onActivada }: Props) {
  const [paso, setPaso] = useState<1 | 2>(emailVerified ? 2 : 1);
  const [ocupado, setOcupado] = useState(false);
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
          {[1, 2].map(n => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${paso >= n ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {paso === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 1 de 2: verificamos tu correo electrónico. El código te sirve por 7 días,
              así puedes terminar cuando tengas tus datos a la mano.
            </p>
            <div>
              <Label className="text-xs">Tu correo</Label>
              <Input type="email"
                value={correo} onChange={e => setCorreo(e.target.value)} autoFocus />
            </div>
            <Button
              variant="outline" className="w-full" disabled={ocupado || !correo.includes("@")}
              onClick={() => ejecutar(async () => {
                await llamar("enviar_correo", { email: correo.trim() });
                toast({ title: "Código enviado", description: "Revisa tu correo (y la carpeta de Spam)." });
              })}
            >
              Enviar código al correo
            </Button>
            <div>
              <Label className="text-xs">Código recibido</Label>
              <Input inputMode="numeric" maxLength={6}
                value={codigoCorreo} onChange={e => setCodigoCorreo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <Button
              className="w-full" disabled={ocupado || codigoCorreo.length !== 6}
              onClick={() => ejecutar(async () => {
                await llamar("verificar_correo", { code: codigoCorreo });
                toast({ title: "Correo verificado" });
                setPaso(2);
              })}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar correo"}
            </Button>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 2 de 2: tus datos legales. Solo se usan en pantallas de dinero; en chats y mapas
              seguirás apareciendo con tu apodo.
            </p>
            <div>
              <Label className="text-xs">Nombre completo</Label>
              <Input
                value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">CURP (18 caracteres)</Label>
              <Input maxLength={18} className="font-mono uppercase"
                value={curp} onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-ZÑ0-9]/g, "").slice(0, 18))} />
              {curp.length === 18 && !validarCurp(curp) && (
                <p className="text-xs text-destructive mt-1">{MENSAJE_CURP_INVALIDA}</p>
              )}
              <a
                href="https://www.gob.mx/curp/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary font-medium mt-1 inline-flex items-center gap-1 underline"
              >
                ¿No sabes tu CURP? Consúltala aquí <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <Button
              className="w-full" disabled={ocupado || nombre.trim().length < 5 || !validarCurp(curp)}
              onClick={() => ejecutar(async () => {
                await llamar("activar", { nombre_completo: nombre.trim(), curp });
                toast({ title: "¡Tu QaRd está ACTIVA!", description: "Ya puedes recargar, pagar y transferir sin comisiones." });
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
