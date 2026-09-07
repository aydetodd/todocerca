import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, Camera, ExternalLink, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";

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

const MIN_BYTES = 1 * 1024 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

async function invocar(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const detalle = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
    let msg = detalle;
    try { msg = JSON.parse(detalle).error ?? detalle; } catch { /* texto plano */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No pudimos leer la foto."));
    lector.readAsDataURL(file);
  });
}

function CapturaFoto({
  titulo, valor, onCambio,
}: { titulo: string; valor: string | null; onCambio: (v: string | null) => void }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const procesar = async (file?: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast({ title: "Formato no válido", description: "La foto debe ser JPG o PNG.", variant: "destructive" });
      return;
    }
    if (file.size < MIN_BYTES) {
      toast({ title: "Foto muy pequeña", description: "Debe pesar al menos 1 MB. Tómala con mejor calidad.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Foto muy grande", description: "Debe pesar máximo 5 MB.", variant: "destructive" });
      return;
    }
    onCambio(await leerArchivo(file));
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{titulo}</span>
        {valor && (
          <button onClick={() => onCambio(null)} className="text-muted-foreground" aria-label="Quitar foto">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {valor ? (
        <img src={valor} alt={titulo} className="w-full rounded-md object-cover max-h-44" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => camara.current?.click()}>
            <Camera className="h-4 w-4 mr-1" /> Cámara
          </Button>
          <Button variant="outline" size="sm" onClick={() => galeria.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Galería
          </Button>
        </div>
      )}
      <input ref={camara} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />
      <input ref={galeria} type="file" accept="image/jpeg,image/png" className="hidden"
        onChange={e => procesar(e.target.files?.[0])} />
    </div>
  );
}

export default function VerificarIdentidadDialog({ open, onOpenChange, onVerificada }: Props) {
  const [paso, setPaso] = useState<"curp" | "datos" | "ine" | "listo">("curp");
  const [ocupado, setOcupado] = useState(false);
  const [curp, setCurp] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [nivel, setNivel] = useState(0);
  const [frente, setFrente] = useState<string | null>(null);
  const [reverso, setReverso] = useState<string | null>(null);

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
    const r = await invocar("verificamex-ine", { frente, reverso });
    setNivel(r.verification_level ?? 2);
    setPaso("listo");
    onVerificada?.();
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
              ¿Quieres validar tu INE para subir tu límite a 3,000 UDIS al mes?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Ahora no</Button>
              <Button onClick={() => setPaso("ine")}>Sí, validar INE</Button>
            </div>
          </div>
        )}

        {paso === "ine" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Toma la foto del frente y del reverso de tu INE. Deben ser JPG o PNG, entre 1 MB y 5 MB,
              con buena luz y sin reflejos.
            </p>
            <CapturaFoto titulo="Frente de la INE" valor={frente} onCambio={setFrente} />
            <CapturaFoto titulo="Reverso de la INE" valor={reverso} onCambio={setReverso} />
            <Button className="w-full" disabled={ocupado || !frente || !reverso} onClick={validarIneAhora}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar y validar INE"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Lo hago después</Button>
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
