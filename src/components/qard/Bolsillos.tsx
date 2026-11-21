import { useCallback, useEffect, useRef, useState } from 'react';
import { LockKeyhole, Plus, ArrowUpLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { validPocketPin } from '@/lib/qardCardState';
import { uniquePocketConcepts, POCKET_CONCEPTS } from '@/lib/qardSavings';
import QardTypeIcon from './QardTypeIcon';
import QardTarjeta from './QardTarjeta';

type Pocket = { concepto: string; saldo: number };
type Response = { ok: boolean; error?: string; token?: string; bolsillos?: Pocket[] };
export default function Bolsillos({ onChanged, numeroEje, nombre }: { onChanged: () => void; numeroEje?: string; nombre?: string }) {
  const eje = (numeroEje ?? '').replace(/\D/g, '');
  const numeroAhorro = eje.length === 16 ? eje.slice(0, 14) + '10' : '';
  const { user } = useAuth();
  const [concepts, setConcepts] = useState<string[]>([]);
  const [items, setItems] = useState<Pocket[]>([]);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [concept, setConcept] = useState('Renta');
  const [pin, setPin] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const currentToken = useRef(token);
  currentToken.current = token;
  const closeDialog = () => { setSelected(null); setCreating(false); setOpening(false); setPin(''); setAmount(''); key.current = crypto.randomUUID(); };
  const lock = useCallback(() => { currentToken.current = null; setToken(null); setItems([]); setSelected(null); setCreating(false); setPin(''); setAmount(''); }, []);
  const load = useCallback(async () => {
    if (!user) return;
    const result = await supabase.from('qard_bolsillos').select('concepto').eq('titular_user_id', user.id).order('created_at');
    setError(!!result.error);
    if (!result.error) setConcepts(uniquePocketConcepts(result.data ?? []));
    const activeToken = currentToken.current;
    if (activeToken) {
      const { data, error: readError } = await supabase.rpc('qard_ahorro_read', { _token: activeToken });
      if (currentToken.current !== activeToken) return;
      const response = data as Response | null;
      if (readError || !response?.ok) lock();
      else setItems(response.bolsillos ?? []);
    }
  }, [user?.id, lock]);
  useEffect(() => { lock(); setConcepts([]); void load(); }, [load, lock]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`ahorro-${user.id}-${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qard_movimientos', filter: `titular_user_id=eq.${user.id}` }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(lock, 5 * 60 * 1000);
    const visibility = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [token, lock]);
  const rpc = async (name: 'qard_ahorro_create' | 'qard_ahorro_unlock' | 'qard_ahorro_return', args: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(name, args as never);
      const result = data as Response | null;
      if (error || !result?.ok) { toast({ title: 'No se pudo completar', description: error?.message ?? result?.error ?? 'Inicia sesión de nuevo', variant: 'destructive' }); return null; }
      return result;
    } finally { setBusy(false); }
  };
  const selectedPocket = items.find(item => item.concepto === selected);
  const available = POCKET_CONCEPTS.filter(value => !concepts.includes(value));
  return <section className="space-y-3 border-t pt-4">
    <h2 className="flex items-center gap-2 font-bold text-lg"><QardTypeIcon pocket />Ahorro · 10</h2>
    <QardTarjeta numero={numeroAhorro} nombre={nombre ?? ''} indice={10} estado="activa" saldo={0} pendiente={!numeroAhorro} sinQr cvvVisible={false} onVerCvv={() => {}} onRotarCvv={() => {}} onQr={() => {}} compactControls />
    <p className="text-xs text-muted-foreground">Dinero sellado: solo regresa a tu Cuenta 00.</p>
    {token ? <>
      <div className="flex items-center justify-between"><h3 className="font-semibold">Mis Bolsillos</h3><div className="flex gap-2"><Button variant="outline" size="icon" title="Cerrar Ahorro" aria-label="Cerrar Ahorro" onClick={lock}><LockKeyhole className="h-4 w-4" /></Button><Button variant="outline" size="icon" title="Nuevo Bolsillo" aria-label="Nuevo Bolsillo" disabled={available.length === 0 || error} onClick={() => { closeDialog(); setConcept(available[0] ?? 'Renta'); setCreating(true); }}><Plus className="h-4 w-4" /></Button></div></div>
      {error ? <p className="text-sm text-destructive">No se pudieron consultar tus Bolsillos.</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Sin Bolsillos</p> : items.map(item => <div key={item.concepto} className="flex items-center justify-between gap-2 border rounded-lg p-3"><span className="flex min-w-0 items-center gap-2"><QardTypeIcon pocket /><span className="break-words">{item.concepto}<span className="block text-muted-foreground font-semibold">${Number(item.saldo).toFixed(2)}</span></span></span><Button variant="outline" size="icon" title={`Regresar ${item.concepto} a Cuenta 00`} aria-label={`Regresar ${item.concepto} a Cuenta 00`} disabled={Number(item.saldo) <= 0} onClick={() => { closeDialog(); setSelected(item.concepto); }}><ArrowUpLeft className="h-4 w-4" /></Button></div>)}
    </> : <Button className="w-full" variant="outline" disabled={error} onClick={() => { closeDialog(); setOpening(true); }}><LockKeyhole className="h-4 w-4 mr-2" />Abrir Ahorro</Button>}
    <Dialog open={opening || creating || !!selected} onOpenChange={open => { if (!open && !busy) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>{opening ? 'Abrir Ahorro · 10' : creating ? 'Nuevo Bolsillo' : selected}</DialogTitle></DialogHeader>
      {opening ? <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (!validPocketPin(pin)) return;
        const result = await rpc('qard_ahorro_unlock', { _pin: pin }); setPin('');
        if (result?.token) { currentToken.current = result.token; setToken(result.token); setItems(result.bolsillos ?? []); closeDialog(); await load(); }
      }}><Label htmlFor="savings-pin">{concepts.length ? 'PIN de Ahorro (el de tu primer Bolsillo)' : 'Crear PIN único de 4 o 6 dígitos'}</Label><Input id="savings-pin" type="password" autoComplete="off" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))} /><Button className="w-full" disabled={busy || !validPocketPin(pin)}>Abrir Ahorro</Button></form>
      : creating && token ? <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); const result = await rpc('qard_ahorro_create', { _id: key.current, _concepto: concept, _token: token, _amount: Number(amount) });
        if (result) { closeDialog(); await load(); onChanged(); toast({ title: 'Dinero guardado en tu Bolsillo' }); }
      }}><Label htmlFor="pocket-concept">Concepto</Label><select id="pocket-concept" className="w-full rounded-md border border-input bg-background p-3" value={concept} onChange={e => setConcept(e.target.value)}>{available.map(value => <option key={value}>{value}</option>)}</select><Label htmlFor="pocket-amount">Guardar desde Cuenta 00</Label><Input id="pocket-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /><Button className="w-full" disabled={busy || Number(amount) <= 0 || !available.includes(concept)}>Guardar en Bolsillo</Button></form>
      : selectedPocket && token ? <div className="space-y-4"><div className="flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-5 w-5" /><span>Dinero sellado</span></div><div className="text-3xl font-bold text-muted-foreground">${Number(selectedPocket.saldo).toFixed(2)}</div><Label htmlFor="pocket-return">Monto a regresar</Label><Input id="pocket-return" type="number" min="0.01" max={Number(selectedPocket.saldo)} step="0.01" value={amount} onChange={e => { setAmount(e.target.value); key.current = crypto.randomUUID(); }} /><Button className="w-full" disabled={busy || Number(amount) <= 0 || Number(amount) > Number(selectedPocket.saldo)} onClick={async () => {
        const result = await rpc('qard_ahorro_return', { _concepto: selectedPocket.concepto, _token: token, _amount: Number(amount), _key: key.current });
        if (result) { closeDialog(); await load(); onChanged(); toast({ title: 'Saldo regresado a Cuenta 00' }); }
      }}><ArrowUpLeft className="h-4 w-4 mr-2" />Regresar a Cuenta 00</Button></div> : null}
    </DialogContent></Dialog>
  </section>;
}
