import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkEfirma, formatFechaMx, validateEfirmaFile, type EfirmaResult } from '@/lib/efirma';

const GENERIC_ERROR = 'Ocurrió un error al validar. Por favor revisa que los archivos sean correctos e intenta de nuevo.';

function expiryAlert(result: EfirmaResult) {
  if (result.status === 'grace') {
    return { tone: 'text-yellow-700 dark:text-yellow-400', text: `⚠️ Tu e.firma venció el ${formatFechaMx(result.expiresAt)}. Tienes ${result.graceDaysLeft} días de gracia para actualizarla.` };
  }
  if (result.daysLeft <= 7) return { tone: 'text-destructive', text: `🚨 Tu e.firma vence en ${result.daysLeft} días. Renueva ahora para no perder acceso.` };
  if (result.daysLeft <= 30) return { tone: 'text-orange-600 dark:text-orange-400', text: `🔶 Tu e.firma vence en ${result.daysLeft} días. Es momento de renovarla.` };
  if (result.daysLeft <= 90) return { tone: 'text-yellow-700 dark:text-yellow-400', text: `⚠️ Tu e.firma vence en ${result.daysLeft} días. Considera renovarla pronto.` };
  return null;
}

export default function EfirmaRegistration() {
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
    setBusy(true); setResult(null); setError('');
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
          const pdfjs = await import('pdfjs-dist');
          const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ data: new Uint8Array(await (pdf as File).arrayBuffer()) });
          const document = await task.promise;
          try {
            if (document.numPages > 10) throw new Error('La constancia debe tener como máximo 10 páginas.');
            text = '';
            for (let page = 1; page <= document.numPages; page++) {
              const content = await (await document.getPage(page)).getTextContent();
              text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
            }
          } finally { await task.destroy(); }
        } catch (e) {
          throw new Error(e instanceof Error && e.message.includes('constancia') ? e.message : 'No se pudo leer el PDF de la constancia. Revisa que no esté dañado.');
        }
      }

      keyBytes = new Uint8Array(await key.arrayBuffer());
      const checked = checkEfirma(new Uint8Array(await cer.arrayBuffer()), keyBytes, String(data.get('password') ?? ''), rfc, text);

      console.log('[e.firma] Guardando resultado (solo RFC, nombre y vencimiento; nunca llave ni contraseña)');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Inicia sesión para guardar tu registro.');
      const existing = await supabase.from('terminal_agent_requests').select('id').eq('user_id', user.id).maybeSingle();
      if (existing.error) throw existing.error;
      const row = {
        user_id: user.id,
        business_name: checked.name,
        rfc_document: 'efirma-local',
        status: 'approved',
        curp_status: 'not_required',
        rfc_status: 'valid',
        biometric_status: 'not_required',
        efirma_validada: true,
        efirma_nombre: checked.name,
        efirma_vence: checked.expiresAt,
      };
      const save = existing.data
        ? await supabase.from('terminal_agent_requests').update(row).eq('id', existing.data.id)
        : await supabase.from('terminal_agent_requests').insert(row);
      if (save.error) throw save.error;

      console.log('[e.firma] Validación completa: Nivel 3 aprobado');
      if (run === generation.current) {
        setResult(checked);
        // Éxito: limpiar archivos y contraseña por seguridad.
        element.reset();
      }
    } catch (e) {
      console.error('[e.firma] Error durante la validación', e);
      if (run === generation.current) setError(e instanceof Error && e.message ? e.message : GENERIC_ERROR);
      // Fallo: conservar archivos y RFC; solo limpiar la contraseña.
      clearPassword();
    } finally {
      keyBytes?.fill(0);
      if (run === generation.current) setBusy(false);
    }
  };

  const alert = result ? expiryAlert(result) : null;
  return <section className="space-y-3 border-b border-border pb-4">
    <h2 className="font-semibold">Registro de comercio · e.firma</h2>
    <form ref={form} className="space-y-3" onSubmit={e => { e.preventDefault(); void check(); }} onChange={resetResult}>
      <div><Label htmlFor="efirma-rfc">RFC del titular o empresa</Label><Input id="efirma-rfc" value={rfc} maxLength={13} disabled={busy} onChange={e => setRfc(e.target.value.toUpperCase())} autoComplete="off" /></div>
      <div><Label htmlFor="efirma-pdf">Constancia de Situación Fiscal vigente (PDF, opcional)</Label><Input id="efirma-pdf" name="pdf" type="file" accept=".pdf,application/pdf" disabled={busy}/></div>
      <div><Label htmlFor="efirma-cer">Certificado público (.cer)</Label><Input id="efirma-cer" name="cer" type="file" accept=".cer" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-key">Llave privada (.key)</Label><Input id="efirma-key" name="key" type="file" accept=".key" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-password">Contraseña de e.firma</Label><Input id="efirma-password" name="password" type="password" autoComplete="off" required disabled={busy}/></div>
      <p className="text-xs text-muted-foreground">La llave y contraseña se revisan en tu dispositivo; no se envían ni guardan.</p>
      <Button type="submit" className="w-full" disabled={busy || rfc.length < 12}>{busy ? 'Cotejando documentos…' : 'Cotejar e.firma y constancia'}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div className="space-y-2 text-sm">
      <p className="font-semibold text-primary">✅ e.firma válida y vigente · Nivel 3 aprobado</p>
      <dl className="space-y-2">
        <div><dt className="text-muted-foreground">Titular</dt><dd className="break-words">{result.name}</dd></div>
        <div><dt className="text-muted-foreground">RFC</dt><dd>{result.rfc}</dd></div>
        <div><dt className="text-muted-foreground">Vence el</dt><dd>{formatFechaMx(result.expiresAt)}</dd></div>
      </dl>
      {alert && <p role="status" className={`text-sm ${alert.tone}`}>{alert.text}</p>}
    </div>}
  </section>;
}
