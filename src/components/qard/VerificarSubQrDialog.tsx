import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";
import { ExternalLink, ShieldCheck } from "lucide-react";

type Props = {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  subQr: { id: string; alias: string; sub_index: number } | null;
  saldoTitular: number;
  onVerificado: () => void;
};

const COSTO = 20;

export default function VerificarSubQrDialog({ abierto, onOpenChange, subQr, saldoTitular, onVerificado }: Props) {
  const [nombre, setNombre] = useState("");
  const [curp, setCurp] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cerrar = (v: boolean) => {
    if (!v) { setNombre(""); setCurp(""); }
    onOpenChange(v);
  };

  const verificar = async () => {
    if (!subQr) return;
    if (nombre.trim().length < 5) {
      return toast({ title: "Escribe el nombre completo", variant: "destructive" });
    }
    const curpLimpia = curp.toUpperCase().replace(/[^A-ZÑ0-9]/g, "");
    if (!validarCurp(curpLimpia)) {
      return toast({ title: "CURP inválida", description: MENSAJE_CURP_INVALIDA, variant: "destructive" });
    }
    if (saldoTitular < COSTO) {
      return toast({
        title: "Saldo insuficiente",
        description: `Necesitas $${COSTO.toFixed(2)} en tu QaRd. Recarga y vuelve a intentar.`,
        variant: "destructive",
      });
    }

    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("verificamex-curp", {
      body: { curp: curpLimpia, nombre_completo: nombre.trim(), sub_qr_id: subQr.id },
    });
    setEnviando(false);

    const err = (data as any)?.error;
    if (error || err) {
      return toast({
        title: "No se pudo verificar",
        description: err ?? "Revisa la CURP e inténtalo otra vez. No se te cobró nada.",
        variant: "destructive",
      });
    }

    toast({
      title: "Sub-QR verificada",
      description: `Se descontaron $${COSTO.toFixed(2)} de tu saldo.`,
    });
    cerrar(false);
    onVerificado();
  };

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Verificar {subQr?.alias}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Validamos la CURP de esta persona ante RENAPO. Se descontarán{" "}
            <b className="text-foreground">${COSTO.toFixed(2)}</b> de tu saldo. Solo se cobra una vez y solo si la
            validación es correcta.
          </p>

          <div>
            <Label className="text-xs">Nombre completo</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Como aparece en su CURP" />
          </div>

          <div>
            <Label className="text-xs">CURP (18 caracteres)</Label>
            <Input
              value={curp}
              maxLength={18}
              onChange={(e) => setCurp(e.target.value.toUpperCase())}
              className="font-mono uppercase tracking-wider"
            />
          </div>

          <a
            href="https://www.gob.mx/curp/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            Consultar CURP oficial <ExternalLink className="h-3 w-3" />
          </a>

          <div className="text-xs text-muted-foreground">
            Tu saldo actual: <b className="text-foreground">${saldoTitular.toFixed(2)}</b>
          </div>

          <Button className="w-full" onClick={verificar} disabled={enviando}>
            {enviando ? "Validando…" : `Verificar y pagar $${COSTO.toFixed(2)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
