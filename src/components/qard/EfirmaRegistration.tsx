import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkEfirma, validateEfirmaFile } from '@/lib/efirma';

export default function EfirmaRegistration() {
  const [rfc, setRfc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof checkEfirma> | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; form.current?.reset(); }, []);
  const resetResult = () => { generation.current++; setResult(null); setError(''); };
  const check = async () => {
    const element = form.current;
    if (!element || busy) return;
    const run = ++generation.current;
    setBusy(true); setResult(null); setError('');
    let keyBytes: Uint8Array | undefined;
    try {
      const data = new FormData(element);
      const cer = data.get('cer'), key = data.get('key'), pdf = data.get('pdf');
      if (!(cer instanceof File) || !(key instanceof File) || !(pdf instanceof File)) throw new Error('Selecciona los tres archivos.');
      validateEfirmaFile(cer, 'cer'); validateEfirmaFile(key, 'key'); validateEfirmaFile(pdf, 'pdf');
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({data: new Uint8Array(await pdf.arrayBuffer())});
      const document = await task.promise;
      let text = '';
      try {
        if (document.numPages > 10) throw new Error('La constancia debe tener como máximo 10 páginas.');
        for (let page = 1; page <= document.numPages; page++) {
          const content = await (await document.getPage(page)).getTextContent();
          text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
        }
      } finally { await task.destroy(); }
      keyBytes = new Uint8Array(await key.arrayBuffer());
      const checked = checkEfirma(new Uint8Array(await cer.arrayBuffer()), keyBytes, String(data.get('password') ?? ''), rfc, text);
      if (run === generation.current) setResult(checked);
    } catch (e) {
      if (run === generation.current) setError(e instanceof Error ? e.message : 'No se pudieron revisar los archivos.');
    } finally {
      keyBytes?.fill(0);
      // Clear file selectors and password; never upload, log, or persist secrets.
      element.reset();
      if (run === generation.current) setBusy(false);
    }
  };
  return <section className="space-y-3 border-b border-border pb-4">
    <h2 className="font-semibold">Registro de comercio · e.firma</h2>
    <form ref={form} className="space-y-3" onSubmit={e => { e.preventDefault(); void check(); }} onChange={resetResult}>
      <div><Label htmlFor="efirma-rfc">RFC del titular o empresa</Label><Input id="efirma-rfc" value={rfc} maxLength={13} disabled={busy} onChange={e => setRfc(e.target.value.toUpperCase())} autoComplete="off" /></div>
      <div><Label htmlFor="efirma-pdf">Constancia de Situación Fiscal vigente (PDF)</Label><Input id="efirma-pdf" name="pdf" type="file" accept=".pdf,application/pdf" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-cer">Certificado público (.cer)</Label><Input id="efirma-cer" name="cer" type="file" accept=".cer" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-key">Llave privada (.key)</Label><Input id="efirma-key" name="key" type="file" accept=".key" required disabled={busy}/></div>
      <div><Label htmlFor="efirma-password">Contraseña de e.firma</Label><Input id="efirma-password" name="password" type="password" autoComplete="off" required disabled={busy}/></div>
      <p className="text-xs text-muted-foreground">La llave y contraseña se revisan en tu dispositivo; no se envían ni guardan.</p>
      <Button type="submit" className="w-full" disabled={busy || rfc.length < 12}>{busy ? 'Cotejando documentos…' : 'Cotejar e.firma y constancia'}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">RFC coincidente</dt><dd>{result.rfc}</dd></div><div><dt className="text-muted-foreground">Titular del certificado</dt><dd className="break-words">{result.name}</dd></div><div><dt className="text-muted-foreground">Llave y contraseña</dt><dd>Coincidencia criptográfica comprobada</dd></div><div><dt className="text-muted-foreground">Vencimiento del certificado</dt><dd>{result.expiresAt.slice(0, 10)}</dd></div></dl>}
    <p role="status" className="text-sm text-muted-foreground">Registro pendiente: falta conectar la comprobación oficial de autenticidad y no revocación del SAT. El cotejo local no aprueba Nivel 3 ni guarda una solicitud.</p>
  </section>;
}