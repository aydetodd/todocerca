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
import QardTypeIcon from './QardTypeIcon';

type Pocket = { id: string; concepto: string };
type Response = { ok: boolean; error?: string; token?: string; saldo?: number };
export default function Bolsillos({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Pocket[]>([]);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Pocket | null>(null);
  const [creating, setCreating] = useState(false);
  const [concept, setConcept] = useState('Renta');
  const [pin, setPin] = useState('');
  const [amount, setAmount] = useState('');
  const [session, setSession] = useState<{ token: string; saldo: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const close = () => { setSelected(null); setCreating(false); setSession(null); setPin(''); setAmount(''); key.current = crypto.randomUUID(); };
  const load = useCallback(async () => {
    if (!user) { setItems([]); return; }
    const result = await supabase.from('qard_bolsillos').select('id,concepto').eq('titular_user_id', user.id).order('created_at');
    setError(!!result.error); if (!result.error) setItems(result.data ?? []);
  }, [user?.id]);
  useEffect(() => { close(); void load(); }, [load]);
  useEffect(() => {
    if (!session || !selected) return;
    const lock = () => setSession(null);
    const timer = setTimeout(lock, 5 * 60 * 1000);
    const visibility = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [session?.token, selected?.id]);
  const rpc = async (name: 'qard_bolsillo_create' | 'qard_bolsillo_unlock' | 'qard_bolsillo_return', args: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(name, args as never);
      const result = data as Response | null;
      if (error || !result?.ok) { toast({ title: 'No se pudo completar', description: error?.message ?? result?.error ?? 'Inicia sesión de nuevo', variant: 'destructive' }); return null; }
      return result;
    } finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t pt-4">
    <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-lg"><QardTypeIcon pocket />Bolsillos</h2><Button variant="outline" size="icon" title="Nuevo Bolsillo" aria-label="Nuevo Bolsillo" onClick={() => { close(); setCreating(true); }}><Plus className="h-4 w-4" /></Button></div>
    {error ? <p className="text-sm text-destructive">No se pudieron consultar tus Bolsillos.</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Sin Bolsillos</p> : items.map(item => <div key={item.id} className="flex items-center justify-between border rounded-lg p-3"><span className="flex items-center gap-2"><QardTypeIcon pocket />{item.concepto}</span><Button variant="outline" onClick={() => { close(); setSelected(item); }}><LockKeyhole className="h-4 w-4 mr-2" />Abrir</Button></div>)}
    <Dialog open={creating || !!selected} onOpenChange={open => { if (!open && !busy) close(); }}><DialogContent><DialogHeader><DialogTitle>{creating ? 'Nuevo Bolsillo' : selected?.concepto}</DialogTitle></DialogHeader>
      {creating ? <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (!validPocketPin(pin)) return;
        const result = await rpc('qard_bolsillo_create', { _id: key.current, _concepto: concept, _pin: pin, _amount: Number(amount) });
        setPin(''); if (result) { close(); await load(); onChanged(); toast({ title: 'Dinero guardado en tu Bolsillo' }); }
      }}>
        <Label htmlFor="pocket-concept">Concepto</Label><select id="pocket-concept" className="w-full rounded-md border border-input bg-background p-3" value={concept} onChange={e => setConcept(e.target.value)}>{['Renta','Útiles','Vacaciones','Emergencias','Salud','Otro'].map(value => <option key={value}>{value}</option>)}</select>
        <Label htmlFor="pocket-amount">Guardar desde Cuenta 00</Label><Input id="pocket-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        <Label htmlFor="pocket-pin">Crear PIN de 4 o 6 dígitos</Label><Input id="pocket-pin" type="password" autoComplete="new-password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))} required />
        <Button className="w-full" disabled={busy || !validPocketPin(pin) || Number(amount) <= 0}>Guardar en Bolsillo</Button>
      </form> : session ? <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-5 w-5" /><span>Dinero sellado</span></div><div className="text-3xl font-bold text-muted-foreground">${session.saldo.toFixed(2)}</div>
        <Label htmlFor="pocket-return">Monto a regresar</Label><Input id="pocket-return" type="number" min="0.01" max={session.saldo} step="0.01" value={amount} onChange={e => { setAmount(e.target.value); key.current = crypto.randomUUID(); }} />
        <Button className="w-full" disabled={busy || Number(amount) <= 0 || Number(amount) > session.saldo} onClick={async () => {
          if (!selected) return;
          const result = await rpc('qard_bolsillo_return', { _id: selected.id, _token: session.token, _amount: Number(amount), _key: key.current });
          if (result) { setSession({ ...session, saldo: Number(result.saldo) }); setAmount(''); key.current = crypto.randomUUID(); onChanged(); toast({ title: 'Saldo regresado a Cuenta 00' }); }
        }}><ArrowUpLeft className="h-4 w-4 mr-2" />Regresar a Cuenta 00</Button>
      </div> : <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (!selected || !validPocketPin(pin)) return;
        const result = await rpc('qard_bolsillo_unlock', { _id: selected.id, _pin: pin }); setPin('');
        if (result?.token && typeof result.saldo === 'number') setSession({ token: result.token, saldo: result.saldo });
      }}><Label htmlFor="pocket-unlock">PIN de 4 o 6 dígitos</Label><Input id="pocket-unlock" type="password" autoComplete="off" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))} /><Button className="w-full" disabled={busy || !validPocketPin(pin)}>Abrir Bolsillo</Button></form>}
    </DialogContent></Dialog>
  </section>;
}