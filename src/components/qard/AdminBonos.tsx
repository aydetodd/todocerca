import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { useToast } from '@/hooks/use-toast';
import { BONOS, GIROS } from '@/lib/qardBonos';

/** Admin TodoCerca: interruptor Despensa, giros por revisar y registro de compras de bonos facturadas. */
export default function AdminBonos() {
  const { toast } = useToast();
  const [despensa, setDespensa] = useState(false);
  const [giros, setGiros] = useState<{ user_id: string; giro: string }[]>([]);
  const [f, setF] = useState({ tel: '', cat: 'alimentos', monto: '', folio: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, g] = await Promise.all([
      supabase.from('pagos_config').select('despensa_habilitada' as any).limit(1).maybeSingle(),
      supabase.from('qard_comercio_giro' as any).select('user_id,giro').eq('estado', 'pending'),
    ]);
    setDespensa(!!(c.data as any)?.despensa_habilitada); setGiros((g.data as any) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true); const { error } = await supabase.rpc(fn as any, args as any); setBusy(false);
    if (error) { toast({ title: 'No se pudo', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: ok }); void load(); return true;
  };

  return <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Bonos QaRd (admin)</summary><div className="space-y-4 pt-3">
    <label className="flex items-center justify-between rounded-lg border p-3"><span>Interruptor maestro Despensa Digital (03)</span>
      <Switch checked={despensa} disabled={busy} onCheckedChange={v => { if (confirm(v ? '¿Encender Despensa Digital para todos?' : '¿Apagar Despensa Digital para todos?')) void rpc('qard_despensa_switch', { _on: v }, v ? 'Despensa encendida' : 'Despensa apagada'); }} />
    </label>
    <div className="space-y-2"><div className="text-sm font-semibold">Giros por revisar ({giros.length})</div>
      {giros.map(g => <div key={g.user_id} className="flex items-center justify-between gap-2 text-sm border rounded p-2">
        <span>{GIROS.find(x => x.giro === g.giro)?.nombre} · {g.user_id.slice(0, 8)}</span>
        <div className="flex gap-1"><Button size="sm" disabled={busy} onClick={() => void rpc('qard_giro_revisar', { _user: g.user_id, _aprobar: true }, 'Aprobado')}>Aprobar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void rpc('qard_giro_revisar', { _user: g.user_id, _aprobar: false }, 'Rechazado')}>Rechazar</Button></div>
      </div>)}
    </div>
    <div className="space-y-2"><div className="text-sm font-semibold">Registrar compra de bonos (ya facturada y pagada)</div>
      <PhoneInput id="tel-empresa-bono" label="Teléfono de la empresa" value={f.tel} onChange={v => setF({ ...f, tel: v })} />
      <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}>{BONOS.map(b => <option key={b.cat} value={b.cat}>{b.nombre}</option>)}</select>
      <div className="grid grid-cols-2 gap-2"><Input inputMode="decimal" placeholder="Monto" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /><Input placeholder="Folio de factura" value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} /></div>
      <Button className="w-full" disabled={busy || !f.tel || !f.monto || !f.folio} onClick={async () => { if (await rpc('qard_bono_emitir_lote', { _telefono: f.tel, _categoria: f.cat, _monto: Number(f.monto), _folio: f.folio }, 'Lote registrado')) setF({ tel: '', cat: f.cat, monto: '', folio: '' }); }}>Registrar lote</Button>
    </div>
  </div></details>;
}
