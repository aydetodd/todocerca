import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Check, ShieldCheck, Loader2, ExternalLink, BadgeCheck, AlertCircle, RefreshCw } from "lucide-react";
import { validarCurp, MENSAJE_CURP_INVALIDA } from "@/lib/curp";
import CapturaFotoIne from "./CapturaFotoIne";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneVerified: boolean;
  emailVerified: boolean;
  onActivada: () => void;
  /** Compatibilidad: ya no se usa, el INE se valida dentro de este mismo flujo */
  onQuiereIne?: () => void;
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

const llamar = (accion: string, extra: Record<string, unknown> = {}) =>
  invocar("qard-identidad", { accion, ...extra });

function nombrePersona(p: Persona) {
  return [p.nombres, p.primerApellido, p.segundoApellido].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

type Paso = 0 | 1 | 2 | 3 | 4 | 5;

export default function ActivarQardDialog({ open, onOpenChange, emailVerified, onActivada }: Props) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState<Paso>(0);
  const [ocupado, setOcupado] = useState(false);
  const [correo, setCorreo] = useState("");
  const [codigoCorreo, setCodigoCorreo] = useState("");
  const [nombre, setNombre] = useState("");
  const [curp, setCurp] = useState("");

  const [validando, setValidando] = useState(false);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [errorCurp, setErrorCurp] = useState<string | null>(null);

  // Nivel 2 (INE)
  const [frente, setFrente] = useState<string | null>(null);
  const [reverso, setReverso] = useState<string | null>(null);
  const [errorIne, setErrorIne] = useState<string | null>(null);
  const [activada, setActivada] = useState(false);

  useEffect(() => {
    if (open) {
      setPaso(0);
      setErrorIne(null);
      setActivada(false);
      setFrente(null);
      setReverso(null);
    }
  }, [open]);

  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); }
    catch (e: any) { toast({ title: "No se pudo continuar", description: e.message, variant: "destructive" }); }
    finally { setOcupado(false); }
  };

  // Validación automática con RENAPO al completar los 18 caracteres
  const validarConRenapo = async (valor: string) => {
    setValidando(true);
    setErrorCurp(null);
    setPersona(null);
    try {
      const res = await invocar("verificamex-curp", { curp: valor, solo_validar: true });
      const p = res?.persona as Persona;
      setPersona(p);
      if (!nombre.trim() && nombrePersona(p)) setNombre(nombrePersona(p));
    } catch (e: any) {
      setErrorCurp(e.message || "No pudimos validar esta CURP. Verifica que esté escrita correctamente.");
    } finally {
      setValidando(false);
    }
  };

  const cambiarCurp = (v: string) => {
    const limpio = v.toUpperCase().replace(/[^A-ZÑ0-9]/g, "").slice(0, 18);
    setCurp(limpio);
    setPersona(null);
    setErrorCurp(null);
    if (limpio.length === 18 && validarCurp(limpio)) void validarConRenapo(limpio);
  };

  /** Activa la QaRd en Nivel 1 (idempotente dentro de este flujo). */
  const asegurarActivada = async () => {
    if (activada) return;
    await llamar("activar", { nombre_completo: nombre.trim(), curp });
    setActivada(true);
    onActivada();
  };

  const terminarNivel1 = () => ejecutar(async () => {
    await asegurarActivada();
    toast({ title: "¡Tu QaRd está activa!", description: "Recarga saldo para comenzar." });
    onOpenChange(false);
    navigate("/qard/recargar");
  });

  const irAIne = () => ejecutar(async () => {
    await asegurarActivada();
    setPaso(5);
  });

  const validarIne = () => ejecutar(async () => {
    setErrorIne(null);
    try {
      await invocar("verificamex-ine", { frente, reverso });
    } catch (e: any) {
      setErrorIne(e.message || "No pudimos validar tu INE.");
      return;
    }
    toast({ title: "¡INE validada!", description: "Tu límite ahora es de 3,000 UDIS al mes." });
    onActivada();
    onOpenChange(false);
    navigate("/qard/recargar");
  });

  const totalPasos = 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Activar mi QaRd
          </DialogTitle>
        </DialogHeader>

        {paso > 0 && (
          <div className="flex items-center gap-2 mb-2">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${Math.min(paso, totalPasos) >= n ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        )}

        {paso === 0 && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Para activar tu tarjeta QaRd y poder mover dinero (recargar, pagar y transferir),
              necesitamos:
            </p>
            <div className="rounded-lg border p-3 space-y-1">
              <p>✅ Verificar tu correo electrónico</p>
              <p>✅ Validar tu identidad con RENAPO (CURP)</p>
              <p>✅ Opcional: validar tu INE para tener un límite más alto</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">Costos claros desde el inicio</p>
              <p className="text-muted-foreground">• $10 pesos — Apertura de cuenta QaRd (una sola vez, se cobra en tu primera recarga)</p>
              <p className="text-muted-foreground">• $5 pesos — Comisión por cada recarga</p>
              <p className="text-muted-foreground">• 2% — Comisión por retiro a banco</p>
              <p className="font-medium pt-1">Ejemplo: si depositas $100 en tu primera recarga, te acreditamos $85.</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">Límites mensuales</p>
              <p className="text-muted-foreground">• Nivel 1 (con CURP): 1,000 UDIS (~$8,150 pesos)</p>
              <p className="text-muted-foreground">• Nivel 2 (con INE): 3,000 UDIS (~$24,500 pesos)</p>
            </div>

            <p className="text-emerald-600 font-medium">✅ Las transferencias entre QaRds no tienen comisión.</p>

            <div className="space-y-2 pt-1">
              <Button className="w-full" onClick={() => setPaso(emailVerified ? 2 : 1)}>
                Entendido, activar mi QaRd
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Seguir usando mi apodo (sin activar)
              </Button>
            </div>
          </div>
        )}

        {paso === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paso 1 de 4: verificamos tu correo electrónico. El código es válido por 7 días,
              así puedes terminar cuando tengas tus datos a la mano.
            </p>
            <div>
              <Label className="text-xs">Tu correo electrónico</Label>
              <Input type="email" value={correo} onChange={e => setCorreo(e.target.value)} autoFocus />
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
              Paso 2 de 4: tus datos legales. Solo se usan en pantallas de dinero; en chats y mapas
              seguirás apareciendo con tu apodo.
            </p>
            <div>
              <Label className="text-xs">Nombre completo (como aparece en tu INE)</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">CURP (18 caracteres)</Label>
              <Input maxLength={18} className="font-mono uppercase"
                value={curp} onChange={e => cambiarCurp(e.target.value)} />
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

            {validando && (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Validando tu identidad con RENAPO...
              </div>
            )}

            {errorCurp && !validando && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {errorCurp}
                </p>
                <Button size="sm" variant="outline" className="w-full"
                  onClick={() => validarConRenapo(curp)} disabled={!validarCurp(curp)}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Intentar de nuevo
                </Button>
              </div>
            )}

            {persona && !validando && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2 text-sm">
                <p className="font-semibold flex items-center gap-2 text-emerald-600">
                  <BadgeCheck className="h-4 w-4" /> Identidad encontrada en RENAPO
                </p>
                <p><span className="text-muted-foreground">Nombre registrado:</span> {nombrePersona(persona) || "—"}</p>
                <p><span className="text-muted-foreground">Fecha de nacimiento:</span> {persona.fechaNacimiento || "—"}</p>
                <p><span className="text-muted-foreground">Entidad:</span> {persona.entidad || "—"}</p>
                <p className="font-medium pt-1">¿Estos datos son correctos?</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => {
                    if (nombrePersona(persona)) setNombre(nombrePersona(persona));
                    setPaso(3);
                  }}>
                    Sí, son correctos
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setCurp(""); setPersona(null); }}>
                    No, mi CURP es diferente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="font-semibold text-emerald-600 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4" /> ¡Tu identidad fue validada correctamente!
              </p>
            </div>

            <p className="font-medium">Elige el tipo de cuenta:</p>

            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">Cuenta Básica — $10 pesos</p>
              <p className="text-muted-foreground">• Ideal para: menores de edad, adultos mayores y familiares</p>
              <p className="text-muted-foreground">• Validación: solo tu CURP</p>
              <p className="text-muted-foreground">• Límite: 1,000 UDIS (~$8,150 pesos al mes)</p>
              <p className="text-muted-foreground">• Se cobran $10 en tu primera recarga</p>
              <Button className="w-full mt-2" onClick={() => setPaso(4)}>
                Seleccionar Cuenta Básica
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">🚀 Cuenta Titular — $25 pesos</p>
              <p className="text-muted-foreground">• Ideal para: adultos que manejan más dinero</p>
              <p className="text-muted-foreground">• Validación: INE completa (frente y reverso)</p>
              <p className="text-muted-foreground">• Límite: 3,000 UDIS (~$24,500 pesos al mes)</p>
              <p className="text-muted-foreground">• Se cobran $25 en tu primera recarga</p>
              <Button variant="outline" className="w-full mt-2" disabled={ocupado} onClick={irAIne}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Seleccionar Cuenta Titular"}
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">Recordatorio de costos</p>
              <p className="text-muted-foreground">• Primera recarga Básica: $15 ($10 apertura + $5 recarga)</p>
              <p className="text-muted-foreground">• Primera recarga Titular: $30 ($25 validación INE + $5 recarga)</p>
              <p className="text-muted-foreground">• Recargas siguientes: $5</p>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Paso 4 de 4: revisa y confirma.</p>
            <div className="rounded-lg border p-3 space-y-1">
              <p><span className="text-muted-foreground">Nombre:</span> {nombre}</p>
              <p className="font-mono"><span className="text-muted-foreground font-sans">CURP:</span> {curp}</p>
              <p><span className="text-muted-foreground">Nivel:</span> 1 (1,000 UDIS al mes)</p>
              <p><span className="text-muted-foreground">Costos:</span> $10 apertura + $5 recarga = $15 en tu primera recarga</p>
            </div>
            <Button className="w-full" disabled={ocupado || nombre.trim().length < 5 || !validarCurp(curp)}
              onClick={terminarNivel1}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Check className="h-4 w-4 mr-1" /> Confirmar y activar</>)}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPaso(3)} disabled={ocupado}>
              Regresar
            </Button>
          </div>
        )}

        {paso === 5 && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">📸 Cuenta Titular: valida tu INE</p>
            <p className="text-muted-foreground">
              Necesitamos fotos de tu INE para validar tu identidad. Al validarla, tu límite sube a
              3,000 UDIS (~$24,500 pesos al mes).
            </p>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-muted-foreground text-xs">Tus datos ya están validados:</p>
              <p><span className="text-muted-foreground">Nombre:</span> {nombre}</p>
              <p className="font-mono"><span className="text-muted-foreground font-sans">CURP:</span> {curp}</p>
            </div>

            <CapturaFotoIne titulo="Paso 1: foto del FRENTE de tu INE" valor={frente} onCambio={setFrente} />
            <CapturaFotoIne titulo="Paso 2: foto del REVERSO de tu INE" valor={reverso} onCambio={setReverso} />
            <p className="text-xs text-muted-foreground">Cada foto debe ser JPG o PNG y pesar máximo 5 MB.</p>

            {errorIne && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {errorIne}
                </p>
                <p className="text-xs text-muted-foreground">
                  Puedes volver a tomar las fotos (hasta 3 intentos) o continuar con la Cuenta Básica de $10.
                </p>
              </div>
            )}

            <Button className="w-full" disabled={ocupado || !frente || !reverso} onClick={validarIne}>
              {ocupado
                ? (<><Loader2 className="h-4 w-4 animate-spin mr-1" /> Validando tu INE...</>)
                : "Validar INE ($25 pesos, se cobran en tu primera recarga)"}
            </Button>
            <Button variant="ghost" className="w-full" disabled={ocupado}
              onClick={() => {
                toast({ title: "¡Tu QaRd está activa!", description: "Quedaste en Cuenta Básica ($10). Puedes subir después." });
                onOpenChange(false);
                navigate("/qard/recargar");
              }}>
              Continuar con Cuenta Básica ($10)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
