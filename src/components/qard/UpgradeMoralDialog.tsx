import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Building2, ExternalLink, Loader2, Upload, User } from "lucide-react";
import { validarRfc, MENSAJE_RFC_INVALIDO } from "@/lib/rfc";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEnviada: () => void;
};

export default function UpgradeMoralDialog({ open, onOpenChange, onEnviada }: Props) {
  const [tipo, setTipo] = useState<"fisica" | "moral">("fisica");
  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [curp, setCurp] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [codigo, setCodigo] = useState("");
  const [correoOk, setCorreoOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const llamarIdentidad = async (accion: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("qard-identidad", { body: { accion, ...extra } });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const enviarCodigo = async () => {
    setOcupado(true);
    try {
      await llamarIdentidad("enviar_correo");
      toast({ title: "Código enviado", description: "Revisa tu correo registrado." });
    } catch (e: any) {
      toast({ title: "No se pudo enviar el código", description: e.message, variant: "destructive" });
    } finally { setOcupado(false); }
  };

  const verificarCodigo = async () => {
    setOcupado(true);
    try {
      await llamarIdentidad("verificar_correo", { code: codigo });
      setCorreoOk(true);
      toast({ title: "Correo confirmado" });
    } catch (e: any) {
      toast({ title: "Código inválido", description: e.message, variant: "destructive" });
    } finally { setOcupado(false); }
  };

  const enviar = async () => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const ext = archivo.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${user.id}/constancia-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("constancias-fiscales")
        .upload(path, archivo, { upsert: false, contentType: archivo.type });
      if (upErr) throw new Error(upErr.message);

      const { data, error } = await supabase.functions.invoke("qard-moral", {
        body: {
          accion: "solicitar",
          tipo_persona: tipo,
          razon_social: nombre.trim(),
          rfc: tipo === "moral" ? rfc : "",
          curp: tipo === "fisica" ? curp : "",
          constancia_path: path,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "Solicitud enviada", description: "La revisaremos en 24 a 48 horas." });
      onEnviada();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e.message, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };

  const datosOk = tipo === "moral" ? validarRfc(rfc) : validarCurp(curp);
  const puedeEnviar = !ocupado && nombre.trim().length >= 3 && datosOk && !!archivo && correoOk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Convertirme en Comerciante
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <b className="text-foreground">$200 pesos al año.</b> Quita el tope de $10,000 al mes
            y desbloquea los retiros a banco (SPEI) y en OXXO. La única comisión es 2% al retirar;
            cobrar y transferir dentro de la app sigue siendo gratis.
          </div>

          <div>
            <Label className="text-xs">Tipo de cuenta</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button type="button" variant={tipo === "fisica" ? "default" : "outline"} onClick={() => setTipo("fisica")}>
                <User className="h-4 w-4 mr-1" /> Persona Física
              </Button>
              <Button type="button" variant={tipo === "moral" ? "default" : "outline"} onClick={() => setTipo("moral")}>
                <Building2 className="h-4 w-4 mr-1" /> Persona Moral
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">{tipo === "moral" ? "Razón Social" : "Nombre completo"}</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
          </div>

          {tipo === "moral" ? (
            <div>
              <Label className="text-xs">RFC</Label>
              <Input className="font-mono uppercase" maxLength={13} value={rfc}
                onChange={e => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "").slice(0, 13))} />
              {rfc.length >= 12 && !validarRfc(rfc) && (
                <p className="text-xs text-destructive mt-1">{MENSAJE_RFC_INVALIDO}</p>
              )}
            </div>
          ) : (
            <div>
              <Label className="text-xs">CURP (18 caracteres)</Label>
              <Input className="font-mono uppercase" maxLength={18} value={curp}
                onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-ZÑ0-9]/g, "").slice(0, 18))} />
              {curp.length === 18 && !validarCurp(curp) && (
                <p className="text-xs text-destructive mt-1">{MENSAJE_CURP_INVALIDA}</p>
              )}
              <a href="https://www.gob.mx/curp/" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary font-medium mt-1 inline-flex items-center gap-1 underline">
                ¿No sabes tu CURP? Consúltala aquí <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div>
            <Label className="text-xs">Constancia de Situación Fiscal (PDF, JPG o PNG)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1">
              El documento debe ser legible y tener el código de barras visible. Será revisado manualmente en 24 a 48 horas.
            </p>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-xs">Confirma que sigues siendo el dueño de la cuenta (por correo)</Label>
            {correoOk ? (
              <p className="text-xs text-emerald-600 font-medium">Correo confirmado ✓</p>
            ) : (
              <>
                <Button type="button" variant="outline" className="w-full" disabled={ocupado} onClick={enviarCodigo}>
                  Enviar código a mi correo
                </Button>
                <Input inputMode="numeric" maxLength={6} value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                <Button type="button" className="w-full" disabled={ocupado || codigo.length !== 6} onClick={verificarCodigo}>
                  Confirmar código
                </Button>
              </>
            )}
          </div>

          <Button className="w-full" disabled={!puedeEnviar} onClick={enviar}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Upload className="h-4 w-4 mr-1" /> Enviar solicitud</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
