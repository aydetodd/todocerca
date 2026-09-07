import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, BadgeCheck, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";
import CapturaFotoIne from "./CapturaFotoIne";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerificada?: () => void;
  /** Nivel ya alcanzado (1 = CURP validada). Si es >= 1 no volvemos a pedir la CURP. */
  nivelActual?: number;
  nombreGuardado?: string | null;
  curpGuardada?: string | null;
};


type Persona = {
  curp: string;
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  sexo: string;
  fechaNacimiento: string;
  entidad: string;
};

async function invocar(fn: string, body: Record<string, unknown>) {
  const peticion = supabase.functions.invoke(fn, { body });
  const limite = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("La validación tardó demasiado. Revisa tu conexión e intenta otra vez.")), 60000);
  });
  const { data, error } = await Promise.race([peticion, limite]);
  if (error) {
    const detalle = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
    let msg = detalle;
    try { msg = JSON.parse(detalle).error ?? detalle; } catch { /* texto plano */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function VerificarIdentidadDialog({
  open, onOpenChange, onVerificada, nivelActual = 0, nombreGuardado, curpGuardada,
}: Props) {
  const [paso, setPaso] = useState<"curp" | "datos" | "ine" | "listo">("curp");
  const [ocupado, setOcupado] = useState(false);
  const [curp, setCurp] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [nivel, setNivel] = useState(0);
  const [frente, setFrente] = useState<string | null>(null);
  const [reverso, setReverso] = useState<string | null>(null);
  const [errorIne, setErrorIne] = useState<string | null>(null);

  // Si la CURP ya quedó validada (Nivel 1+), pasamos directo a la INE: no la volvemos a pedir.
  useEffect(() => {
    if (!open) return;
    setNivel(nivelActual);
    setPaso(nivelActual >= 2 ? "listo" : nivelActual >= 1 ? "ine" : "curp");
    setFrente(null);
    setReverso(null);
    setErrorIne(null);
  }, [open, nivelActual]);


  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); }
    catch (e: any) { toast({ title: "No se pudo validar", description: e.message, variant: "destructive" }); }
    finally { setOcupado(false); }
  };

  const validarCurpAhora = () => ejecutar(async () => {
    const r = await invocar("verificamex-curp", { curp });
    setPersona(r.persona as Persona);
    setNivel(r.verification_level ?? 1);
    setPaso("datos");
    onVerificada?.();
  });

  const validarIneAhora = () => ejecutar(async () => {
    setErrorIne(null);
    try {
      const r = await invocar("verificamex-ine", { frente, reverso });
      setNivel(r.verification_level ?? 2);
      setPaso("listo");
      onVerificada?.();
    } catch (e: unknown) {
      const mensaje = e instanceof Error ? e.message : "No pudimos validar tu INE.";
      setErrorIne(mensaje);
      throw e;
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Validar mi identidad
          </DialogTitle>
        </DialogHeader>

        {paso === "curp" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escribe tu CURP. La revisamos con el registro oficial (RENAPO) para dejar tu cuenta
              verificada Nivel 1 con un límite de 1,000 UDIS al mes.
            </p>
            <div>
              <Label className="text-xs">CURP (18 caracteres)</Label>
              <Input maxLength={18} className="font-mono uppercase" autoFocus value={curp}
                onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-ZÑ0-9]/g, "").slice(0, 18))} />
              {curp.length === 18 && !validarCurp(curp) && (
                <p className="text-xs text-destructive mt-1">{MENSAJE_CURP_INVALIDA}</p>
              )}
              <a href="https://www.gob.mx/curp/" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary font-medium mt-1 inline-flex items-center gap-1 underline">
                ¿No sabes tu CURP? Consúltala aquí <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <Button className="w-full" disabled={ocupado || !validarCurp(curp)} onClick={validarCurpAhora}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar identidad"}
            </Button>
          </div>
        )}

        {paso === "datos" && persona && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <BadgeCheck className="h-4 w-4" /> Cuenta Verificada Nivel 1
              </div>
              <div><span className="text-muted-foreground">Nombre: </span>
                {[persona.nombres, persona.primerApellido, persona.segundoApellido].filter(Boolean).join(" ")}</div>
              {persona.fechaNacimiento && (
                <div><span className="text-muted-foreground">Nacimiento: </span>{persona.fechaNacimiento}</div>
              )}
              <div><span className="text-muted-foreground">CURP: </span><span className="font-mono">{persona.curp}</span></div>
              <div className="text-xs text-muted-foreground">Límite: 1,000 UDIS al mes</div>
            </div>
            <p className="text-sm">
              ¿Quieres validar tu INE para subir tu límite a 3,000 UDIS al mes? (Cuenta Titular: $25 pesos, se cobran en tu primera recarga)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Ahora no</Button>
              <Button onClick={() => setPaso("ine")}>Sí, validar INE</Button>
            </div>
          </div>
        )}

        {paso === "ine" && (
          <div className="space-y-3">
            {(persona || nombreGuardado || curpGuardada) && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck className="h-4 w-4" /> CURP ya validada
                </div>
                <div><span className="text-muted-foreground">Nombre: </span>
                  {persona
                    ? [persona.nombres, persona.primerApellido, persona.segundoApellido].filter(Boolean).join(" ")
                    : nombreGuardado}
                </div>
                <div><span className="text-muted-foreground">CURP: </span>
                  <span className="font-mono">{persona?.curp ?? curpGuardada}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Solo comparamos tu INE con estos datos. No necesitas escribirla otra vez.
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Toma la foto del frente y del reverso de tu INE. Deben ser JPG o PNG, entre 150 KB y 5 MB,
              con buena luz y sin reflejos.
            </p>

            <CapturaFotoIne titulo="Frente de la INE" valor={frente} onCambio={setFrente} />
            <CapturaFotoIne titulo="Reverso de la INE" valor={reverso} onCambio={setReverso} />
            {errorIne && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {errorIne}
                </p>
              </div>
            )}
            <Button type="button" className="w-full" disabled={ocupado || !frente || !reverso} onClick={validarIneAhora}>
              {ocupado ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando con Verificamex...</> : "Enviar y validar INE"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={ocupado} onClick={() => onOpenChange(false)}>Lo hago después</Button>
          </div>
        )}

        {paso === "listo" && (
          <div className="space-y-3 text-center">
            <BadgeCheck className="h-12 w-12 mx-auto text-emerald-500" />
            <div className="font-semibold">Cuenta Verificada Nivel {nivel}</div>
            <p className="text-sm text-muted-foreground">
              Tu límite mensual ahora es de 3,000 UDIS.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Listo</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
