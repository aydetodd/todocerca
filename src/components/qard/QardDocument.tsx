import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, LockKeyhole, LockKeyholeOpen, Download, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Address } from '../../../supabase/functions/_shared/qardConcentrado';

type Selection = { number: string; token?: string | null };
type Context = { addresses: Map<string, Address>; loading: boolean; error: boolean; open: (s: Selection) => void };
const DocumentContext = createContext<Context | null>(null);
type Fields = Pick<Address, 'calle' | 'numero' | 'colonia' | 'cp' | 'municipio' | 'estado'>;
const empty: Fields = { calle: '', numero: '', colonia: '', cp: '', municipio: '', estado: '' };
const fields: { key: keyof Fields; label: string }[] = [{ key: 'calle', label: 'Calle' }, { key: 'numero', label: 'Número exterior / interior' }, { key: 'colonia', label: 'Colonia' }, { key: 'cp', label: 'Código postal' }, { key: 'municipio', label: 'Municipio' }, { key: 'estado', label: 'Estado' }];

export function QardDocumentProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [addresses, setAddresses] = useState<Map<string, Address>>(new Map());
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [form, setForm] = useState<Fields>(empty), [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const currentUser = useRef(userId); currentUser.current = userId;
  const reload = useCallback(async () => {
    if (!userId) { setLoading(false); setError(true); return; }
    const { data, error } = await supabase.from('qard_domicilios').select('*').eq('owner_id', userId);
    if (currentUser.current !== userId) return;
    setError(!!error); setLoading(false);
    if (!error) setAddresses(new Map((data ?? []).map(row => [row.qard_number, row as Address])));
  }, [userId]);
  useEffect(() => { setSelected(null); setAddresses(new Map()); setLoading(true); void reload(); }, [reload]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`qard-address-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'qard_domicilios', filter: `owner_id=eq.${userId}` }, () => void reload()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, reload]);
  const open = (s: Selection) => {
    const a = addresses.get(s.number);
    setForm(a ? { calle: a.calle, numero: a.numero, colonia: a.colonia, cp: a.cp, municipio: a.municipio, estado: a.estado } : { ...empty });
    setMessage(''); setDays(30); setSelected(s);
  };
  const address = selected ? addresses.get(selected.number) : undefined;
  const verified = address?.status === 'valid' && address.progress === 3;
  const save = async () => {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('qard_domicilio_guardar', { _qard: selected.number, _address: form });
      if (error) throw error;
      await reload(); setMessage('Domicilio guardado. Todavía no está verificado.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo guardar el domicilio.'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('qard-documento', { body: { qard: selected.number, days, savings_token: selected.token ?? undefined } });
      if (error) {
        let detail = 'No se pudo generar el documento. Intenta de nuevo.';
        if ('context' in error && error.context instanceof Response) {
          const body = await error.context.clone().json().catch(() => null);
          if (body?.error) detail = String(body.error);
        }
        throw new Error(detail);
      }
      if (!(data instanceof Blob) || data.type !== 'application/pdf') throw new Error('El emisor no devolvió un PDF.');
      const url = URL.createObjectURL(data), a = document.createElement('a');
      a.href = url; a.download = `TodoCerca-QaRd-${selected.number.slice(-2)}-concentrado.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('Documento descargado.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo descargar el PDF.'); }
    finally { setBusy(false); }
  };
  return <DocumentContext.Provider value={{ addresses, loading, error, open }}>
    {children}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Estado de Cuenta · QaRd {selected?.number.slice(-2)}</DialogTitle></DialogHeader>
        <div className={`flex items-center gap-2 text-sm ${verified ? 'qard-document-verified' : 'text-muted-foreground'}`}>
          {verified ? <LockKeyholeOpen className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
          <span>{error ? 'Domicilio no disponible' : `${address?.progress ?? 0}/3 · ${verified ? 'Presencia reforzada verificada' : 'Domicilio sin verificar'}`}</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qard-document-period">Periodo</Label>
          <select id="qard-document-period" className="w-full border border-input rounded-md bg-background p-2" value={days} disabled={busy} onChange={e => setDays(Number(e.target.value))}>
            {[[7, '7 días'], [15, '15 días'], [30, '1 mes'], [62, '2 meses']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button className="w-full" disabled={busy || error || (selected?.number.endsWith('10') && !selected.token)} onClick={() => void download()}><Download className="h-4 w-4 mr-2" />{busy ? 'Procesando…' : 'Descargar PDF concentrado'}</Button>
          {selected?.number.endsWith('10') && !selected.token && <p className="text-xs text-muted-foreground">Abre Ahorro con tu PIN para consultar su estado.</p>}
          <p className="text-xs text-muted-foreground">El PDF contiene tu nombre legal, número completo y domicilio. Compártelo solo con quien corresponda.</p>
        </div>
        <form className="border-t pt-4 space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
          <h3 className="font-semibold">Domicilio de esta tarjeta</h3>
          <div className="grid grid-cols-2 gap-3">{fields.map(f => <div key={f.key} className={f.key === 'calle' || f.key === 'colonia' ? 'col-span-2 space-y-1' : 'min-w-0 space-y-1'}>
            <Label htmlFor={`qard-address-${f.key}`}>{f.label}</Label>
            <Input id={`qard-address-${f.key}`} value={form[f.key]} maxLength={f.key === 'cp' ? 5 : 160} inputMode={f.key === 'cp' ? 'numeric' : 'text'} required disabled={busy} onChange={e => setForm(v => ({ ...v, [f.key]: f.key === 'cp' ? e.target.value.replace(/\D/g, '') : e.target.value }))} />
          </div>)}</div>
          {verified && <p className="text-xs text-destructive">Cambiar el domicilio reinicia su verificación.</p>}
          <Button type="submit" variant="outline" disabled={busy || error || !/^\d{5}$/.test(form.cp) || fields.some(f => !form[f.key].trim())}><Save className="h-4 w-4 mr-2" />Guardar domicilio</Button>
          <p className="text-xs text-muted-foreground">La prueba de vida con Verificamex está pendiente de habilitación. Guardar una dirección no acredita presencia ni cambia tu nivel financiero.</p>
        </form>
        {message && <p role="status" className="text-sm break-words">{message}</p>}
      </DialogContent>
    </Dialog>
  </DocumentContext.Provider>;
}

export function QardDocumentControl({ number, token }: { number: string; token?: string | null }) {
  const context = useContext(DocumentContext);
  if (!/^\d{16}$/.test(number)) return null;
  const address = context?.addresses.get(number);
  const verified = address?.status === 'valid' && address.progress === 3;
  const unavailable = !context || context.error || context.loading;
  const label = `Documento de QaRd ${number.slice(-2)} · ${unavailable ? 'Consultando' : `${address?.progress ?? 0}/3`}`;
  return <Button variant="ghost" size="icon" className={`relative shrink-0 flex-col gap-0 ${verified ? 'qard-document-verified' : address?.progress ? 'qard-document-pending' : 'text-muted-foreground'}`} disabled={unavailable} title={label} aria-label={label} onClick={() => context?.open({ number, token })}>
    <span className="relative"><FileText className="h-4 w-4" />{verified ? <LockKeyholeOpen className="absolute -right-1 -bottom-0.5 h-2.5 w-2.5 bg-background" /> : <LockKeyhole className="absolute -right-1 -bottom-0.5 h-2.5 w-2.5 bg-background" />}</span>
    <span className="text-[8px] leading-3">{unavailable ? '…' : `${address?.progress ?? 0}/3`}</span>
  </Button>;
}