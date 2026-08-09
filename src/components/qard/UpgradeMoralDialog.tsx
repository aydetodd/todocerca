import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Building2, Loader2, Upload } from "lucide-react";
import { validarRfc, MENSAJE_RFC_INVALIDO } from "@/lib/rfc";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEnviada: () => void;
};

export default function UpgradeMoralDialog({ open, onOpenChange, onEnviada }: Props) {
  const [razon, setRazon] = useState("");
  const [rfc, setRfc] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);

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
        body: { accion: "solicitar", razon_social: razon.trim(), rfc, constancia_path: path },
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

  const rfcValido = validarRfc(rfc);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Convertir a Persona Moral / Proveedor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre de la compañía (Razón Social)</Label>
            <Input value={razon} onChange={e => setRazon(e.target.value)} autoFocus />
          </div>
          <div>
            <Label className="text-xs">RFC</Label>
            <Input className="font-mono uppercase" maxLength={13} value={rfc}
              onChange={e => setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "").slice(0, 13))} />
            {rfc.length >= 12 && !rfcValido && (
              <p className="text-xs text-destructive mt-1">{MENSAJE_RFC_INVALIDO}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Constancia de Situación Fiscal (PDF, JPG o PNG)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground mt-1">
              El documento debe ser legible y tener el código de barras visible. Será revisado manualmente en 24 a 48 horas.
            </p>
          </div>
          <Button className="w-full" disabled={ocupado || razon.trim().length < 3 || !rfcValido || !archivo} onClick={enviar}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Upload className="h-4 w-4 mr-1" /> Enviar solicitud</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
