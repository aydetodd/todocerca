import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileCheck2, FileX2, LockKeyhole, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { printDate } from '../../supabase/functions/_shared/qardConcentrado';

type Verification = { found: boolean; issued_at?: string; pdf_hash?: string; address_verified?: boolean };
export default function VerificarDocumento() {
  const { hash } = useParams();
  const [result, setResult] = useState<Verification | null>(null), [error, setError] = useState(false), [fileState, setFileState] = useState('');
  useEffect(() => {
    document.title = 'Verificar documento QaRd · TodoCerca';
    let active = true;
    setResult(null); setError(false); setFileState('');
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) { setResult({ found: false }); return; }
    void supabase.rpc('qard_documento_verificar', { _hash: hash }).then(({ data, error }) => {
      if (!active) return;
      setError(!!error); if (!error) setResult(data as Verification);
    });
    return () => { active = false; };
  }, [hash]);
  return <main className="min-h-screen bg-background px-5 py-10 pb-40 text-foreground">
    <header className="max-w-xl mx-auto border-b border-border pb-5"><a href="/landing" className="font-bold text-lg">TODOCERCA</a></header>
    <section className="max-w-xl mx-auto pt-8 space-y-5">
      <h1 className="text-2xl font-bold">Verificar documento QaRd</h1>
      {error ? <><p role="alert" className="text-destructive">No se pudo consultar el registro. Intenta nuevamente.</p><Button variant="outline" onClick={() => window.location.reload()}>Reintentar</Button></> : !result ? <p role="status">Consultando documento…</p> : !result.found ? <div className="space-y-3"><FileX2 className="h-10 w-10 text-destructive"/><h2 className="font-semibold">Documento no encontrado</h2><p className="text-muted-foreground">Este código no corresponde a un documento emitido por TodoCerca.</p></div> : <>
        <div className="flex items-center gap-3"><FileCheck2 className="h-10 w-10 qard-document-verified"/><h2 className="font-semibold text-lg">Registro de emisión encontrado</h2></div>
        {result.issued_at && <p>Emitido el {printDate(result.issued_at)}.</p>}
        <p className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 shrink-0"/>{result.address_verified ? 'Domicilio verificado por presencia reforzada.' : 'El domicilio no está verificado, o fue modificado después de la emisión.'}</p>
        <p className="text-sm text-muted-foreground">El código confirma la emisión. Para comprobar que el archivo no fue alterado, selecciona el PDF original.</p>
        <label className="flex items-center gap-2 font-medium" htmlFor="verify-document-file"><Upload className="h-4 w-4"/>Comprobar PDF original</label>
        <input id="verify-document-file" className="block w-full text-sm" type="file" accept="application/pdf,.pdf" onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          if (file.size > 10 * 1024 * 1024) { setFileState('El archivo supera 10 MB.'); return; }
          try {
            const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            const actual = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
            setFileState(actual === result.pdf_hash ? 'PDF auténtico: coincide exactamente con el archivo emitido.' : 'El PDF no coincide: fue modificado o pertenece a otro documento.');
          } catch { setFileState('No se pudo comprobar el archivo.'); }
        }}/>
        {fileState && <p role="status" className="font-medium break-words">{fileState}</p>}
        <p className="text-xs text-muted-foreground">El archivo se comprueba en tu dispositivo y no se envía. No se publican nombre, tarjeta, saldo ni dirección. Este sello acredita integridad, no sustituye una firma e.firma ni garantiza aceptación por otra institución.</p>
      </>}
    </section>
  </main>;
}