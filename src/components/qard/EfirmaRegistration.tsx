import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkEfirma, EFIRMA_STEPS, extractRazonSocial, formatFechaMx, validateEfirmaFile, type EfirmaResult, type TipoPersona } from '@/lib/efirma';

// Safari/iOS no permite recorrer ReadableStream con for-await; PDF.js lo necesita para leer texto.
function ensureStreamIterator() {
  const proto = (globalThis as any).ReadableStream?.prototype;
  if (!proto || proto[Symbol.asyncIterator]) return;
  proto[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) return; yield value; } }
    finally { reader.releaseLock(); }
  };
}

export const LIMITACION_SUPLANTACION = 'Este cotejo valida que los documentos fiscales son consistentes entre sí y que el certificado está vigente. Sin embargo, no verifica que la persona que se registra sea el titular real de la e.firma. En fases posteriores se implementará una prueba de posesión o verificación biométrica para confirmar la identidad del operador.';

const GENERIC_ERROR = 'Ocurrió un error al validar. Revisa que los archivos sean correctos e intenta de nuevo.';

function expiryAlert(result: EfirmaResult) {
  if (result.status === 'grace') {
    return { tone: 'text-yellow-700 dark:text-yellow-400', text: `⚠️ Tu e.firma venció el ${formatFechaMx(result.expiresAt)}. Tienes ${result.graceDaysLeft} días de gracia para actualizarla.` };
  }
  if (result.daysLeft <= 7) return { tone: 'text-destructive', text: `🚨 Tu e.firma vence en ${result.daysLeft} días. Renueva ahora para no perder acceso.` };
  if (result.daysLeft <= 30) return { tone: 'text-orange-600 dark:text-orange-400', text: `🔶 Tu e.firma vence en ${result.daysLeft} días. Es momento de renovarla.` };
  if (result.daysLeft <= 90) return { tone: 'text-yellow-700 dark:text-yellow-400', text: `⚠️ Tu e.firma vence en ${result.daysLeft} días. Considera renovarla pronto.` };
  return null;
}

export default function EfirmaRegistration({ tipo: tipoInicial, onSuccess }: { tipo?: TipoPersona; onSuccess?: () => void } = {}) {
  const [tipo, setTipo] = useState<TipoPersona>(tipoInicial ?? 'moral');
  const [step, setStep] = useState(-1);
  const [razon, setRazon] = useState<string | null>(null);
  const [rfc, setRfc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EfirmaResult | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; form.current?.reset(); }, []);
  const resetResult = () => { generation.current++; setResult(null); setError(''); };

  const clearPassword = () => {
    const field = form.current?.querySelector<HTMLInputElement>('#efirma-password');
    if (field) field.value = '';
  };

  const check = async () => {
    const element = form.current;
    if (!element || busy) return;
    const run = ++generation.current;
    setBusy(true); setResult(null); setError(''); setStep(-1);
    let keyBytes: Uint8Array | undefined;
    try {
      const data = new FormData(element);
      const cer = data.get('cer'), key = data.get('key'), pdf = data.get('pdf');
      if (!(cer instanceof File) || cer.size === 0) throw new Error('Selecciona tu certificado .cer.');
      if (!(key instanceof File) || key.size === 0) throw new Error('Selecciona tu llave privada .key.');
      validateEfirmaFile(cer, 'cer'); validateEfirmaFile(key, 'key');
      const hasPdf = pdf instanceof File && pdf.size > 0;
      if (hasPdf) validateEfirmaFile(pdf as File, 'pdf');

      let text: string | null = null;
      if (hasPdf) {
        console.log('[e.firma] Extrayendo texto de la constancia (PDF)');
        try {
          ensureStreamIterator();
          const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
          const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ data: new Uint8Array(await (pdf as File).arrayBuffer()) });
          const document = await task.promise;
          try {
            if (document.numPages > 10) throw new Error('La constancia debe tener como máximo 10 páginas.');
            text = '';
            for (let page = 1; page <= document.numPages; page++) {
              const content = await (await document.getPage(page)).getTextContent();
              text += (content.items as any[]).map(item => 'str' in item ? item.str : '').join(' ') + '\n';
            }
          } finally { await task.destroy(); }
        } catch (e) {
          throw new Error(e instanceof Error && e.message.includes('constancia') ? e.message : 'No se pudo leer el PDF de la constancia. Revisa que no esté dañado.');
        }
      }

      keyBytes = new Uint8Array(await key.arrayBuffer());
      const checked = checkEfirma(new Uint8Array(await cer.arrayBuffer()), keyBytes, String(data.get('password') ?? ''), rfc, text, new Date(), tipo, i => { if (run === generation.current) setStep(i); });
      const razonSocial = tipo === 'moral' ? (extractRazonSocial(text) ?? checked.name) : null;

      console.log('[e.firma] Guardando resultado (solo RFC, nombre y vencimiento; nunca llave ni contraseña)');
      const { error: saveError } = await supabase.rpc('qard_registrar_empresa_efirma' as any, {
        _rfc: checked.rfc, _tipo: tipo, _razon_social: razonSocial ?? '', _representante: checked.name, _vence: checked.expiresAt,
      });
      if (saveError) throw saveError;

      console.log('[e.firma] Validación completa: Nivel 3 aprobado');
      if (run === generation.current) {
        setResult(checked); setRazon(razonSocial);
        // Éxito: limpiar archivos y contraseña por seguridad.
        element.reset();
        onSuccess?.();
      }
    } catch (e) {
      console.error('[e.firma] Error durante la validación', e);
      if (run === generation.current) setError(e instanceof Error && !(e instanceof TypeError) && e.message ? e.message : GENERIC_ERROR);
      // Fallo: conservar archivos y RFC; solo limpiar la contraseña.
      clearPassword();
    } finally {
      keyBytes?.fill(0);
      if (run === generation.current) setBusy(false);
    }
  };

  const alert = result ? expiryAlert(result) : null;
  return <section className="space-y-3 border-b border-border pb-4">
    <h2 className="font-semibold">Registro empresarial · e.firma (Nivel 3)</h2>
    {!result && <form ref={form} className="space-y-3" onSubmit={e => { e.preventDefault(); void check(); }} onChange={resetResult}>
      {!tipoInicial && <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={tipo === 'moral' ? 'default' : 'outline'} disabled={busy} onClick={() => { setTipo('moral'); resetResult(); }}>Empresa (Persona Moral)</Button>
        <Button type="button" variant={tipo === 'fisica' ? 'default' : 'outline'} disabled={busy} onClick={() => { setTipo('fisica'); resetResult(); }}>Persona física</Button>
      </div>}
      <div><Label htmlFor="efirma-rfc">{tipo === 'moral' ? 'RFC de la empresa (12 caracteres)' : 'RFC del titular (13 caracteres)'}</Label><Input id="efirma-rfc" value={rfc} maxLength={tipo === 'moral' ? 12 : 13} disabled={busy} onChange={e => setRfc(e.target.value.toUpperCase().trim())} autoComplete="off" /></div>
      <div><Label htmlFor="efirma-pdf">Constancia de Situación Fiscal vigente (PDF, opcional pero recomendado)</Label><Input id="efirma-pdf" name="pdf" type="file" accept=".pdf,application/pdf" disabled={busy}/></div>
      <div><Label htmlFor="efirma-cer">Certificado público (.cer){tipo === 'moral' ? ' de la empresa' : ''}</Label><Input id="efirma-cer" name="cer" type="file" accept=".cer" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-key">Llave privada (.key)</Label><Input id="efirma-key" name="key" type="file" accept=".key" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-password">Contraseña de e.firma</Label><Input id="efirma-password" name="password" type="password" autoComplete="off" required disabled={busy}/></div>
      <p className="text-xs text-muted-foreground">La llave y la contraseña se revisan solo en tu teléfono; no se envían ni se guardan.</p>
      <p className="rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">ℹ️ {LIMITACION_SUPLANTACION}</p>
      <Button type="submit" className="w-full" disabled={busy || rfc.length !== (tipo === 'moral' ? 12 : 13)}>{busy ? 'Cotejando documentos…' : 'Cotejar e.firma y constancia'}</Button>
      {busy && step >= 0 && <p role="status" className="text-sm text-muted-foreground">Paso {step + 1} de 5: {EFIRMA_STEPS[step]}…</p>}
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div className="space-y-2 text-sm">
      <p className="font-semibold text-primary">✅ Registro empresarial completado</p>
      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-1">
        <p className="font-semibold">Tus datos fiscales coinciden</p>
        <p className="text-muted-foreground">Revisamos tu RFC, tu certificado (.cer) y tu llave (.key){razon ? ' y tu Constancia de Situación Fiscal' : ''}: todo pertenece a la misma persona y la e.firma está vigente. Con esta comprobación tu QaRd Empresarial quedó activada y ya puedes invitar terminales.</p>
      </div>
      <dl className="space-y-2">
        {razon && <div><dt className="text-muted-foreground">📋 Empresa</dt><dd className="break-words">{razon}</dd></div>}
        <div><dt className="text-muted-foreground">👤 {tipo === 'moral' ? 'Representante legal / titular del certificado' : 'Titular'}</dt><dd className="break-words">{result.name}</dd></div>
        <div><dt className="text-muted-foreground">RFC</dt><dd>{result.rfc}</dd></div>
        {result.representativeRfc && <div><dt className="text-muted-foreground">RFC del representante legal</dt><dd>{result.representativeRfc}</dd></div>}
        <div><dt className="text-muted-foreground">📅 e.firma vigente hasta</dt><dd>{formatFechaMx(result.expiresAt)}</dd></div>
      </dl>
      {alert && <p role="status" className={`text-sm ${alert.tone}`}>{alert.text}</p>}
    </div>}
  </section>;
}
