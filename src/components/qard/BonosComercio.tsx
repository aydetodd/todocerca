import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { useToast } from '@/hooks/use-toast';
import { BONOS, GIROS, bonosDelGiro, bonoPorCat } from '@/lib/qardBonos';

type GiroRow = { giro: string; estado: string; sellos: string[] };
type Lote = { id: string; categoria: string; monto_total: number; saldo_disponible: number; folio_factura: string };
const ESTADO: Record<string, string> = { pending: 'En revisión por TodoCerca', approved: 'Aprobado', rejected: 'No aprobado' };

/** Giro, sellos, bonos cobrados, conversión y reparto de bonos a empleados. */
export default function BonosComercio({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth(); const { toast } = useToast();
  const [giro, setGiro] = useState<GiroRow | null>(null);
  const [saldos, setSaldos] = useState<{ categoria: string; saldo_mxn: number }[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [elegido, setElegido] = useState('comida');
  const [busy, setBusy] = useState(false);
  const [ent, setEnt] = useState<{ lote: string; tel: string; monto: string }>({ lote: '', tel: '', monto: '' });
  const convKey = useRef(crypto.randomUUID()); const entKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    if (!user) return;
    const [g, s, l] = await Promise.all([
      supabase.from('qard_comercio_giro' as any).select('giro,estado,sellos').eq('user_id', user.id).maybeSingle(),
      supabase.from('qard_comercio_bonos' as any).select('categoria,saldo_mxn').eq('user_id', user.id),
      supabase.from('qard_bono_lotes' as any).select('id,categoria,monto_total,saldo_disponible,folio_factura').eq('empresa_user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setGiro((g.data as any) ?? null); setSaldos((s.data as any) ?? []); setLotes((l.data as any) ?? []);
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true); const { error } = await supabase.rpc(fn as any, args as any); setBusy(false);
    if (error) { toast({ title: 'No se pudo', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: ok }); void load(); onChanged(); return true;
  };

  const totalBonos = saldos.reduce((a, s) => a + Number(s.saldo_mxn), 0);
  const permitidos = giro?.estado === 'approved' ? bonosDelGiro(giro.giro) : [];

  return <div className="space-y-4 rounded-xl border p-4">
    <h3 className="font-bold text-lg">Bonos y sellos</h3>
    <div className="space-y-2">
      <div className="text-sm font-semibold">Giro de mi negocio</div>
      {giro && <div className="text-sm">{GIROS.find(g => g.giro === giro.giro)?.nombre} · <b>{ESTADO[giro.estado]}</b></div>}
      {(!giro || giro.estado === 'rejected') && <div className="flex gap-2">
        <select className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm" value={elegido} onChange={e => setElegido(e.target.value)}>
          {GIROS.map(g => <option key={g.giro} value={g.giro}>{g.nombre}</option>)}
        </select>
        <Button disabled={busy} onClick={() => void rpc('qard_giro_solicitar', { _giro: elegido }, 'Giro enviado a revisión')}>Enviar</Button>
      </div>}
    </div>

    {permitidos.length > 0 && <div className="space-y-2">
      <div className="text-sm font-semibold">Sellos en el mapa</div>
      {permitidos.map(c => { const b = bonoPorCat(c)!; const on = giro!.sellos.includes(c);
        return <label key={c} className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <span>{b.emoji} Acepta {b.nombre}</span>
          <Switch checked={on} disabled={busy} onCheckedChange={v => void rpc('qard_sello_set', { _categoria: c, _on: v }, v ? 'Sello encendido' : 'Sello apagado')} />
        </label>; })}
    </div>}

    <div className="space-y-2">
      <div className="text-sm font-semibold">Bonos cobrados</div>
      {BONOS.filter(b => saldos.some(s => s.categoria === b.cat)).map(b => <div key={b.cat} className="flex justify-between text-sm"><span>{b.emoji} {b.nombre}</span><b>${Number(saldos.find(s => s.categoria === b.cat)?.saldo_mxn ?? 0).toFixed(2)}</b></div>)}
      <Button className="w-full min-h-12" disabled={busy || totalBonos <= 0} onClick={async () => { if (await rpc('qard_bono_convertir', { _key: convKey.current }, 'Bonos convertidos a saldo general')) convKey.current = crypto.randomUUID(); }}>
        Convertir bonos a saldo general (${totalBonos.toFixed(2)})
      </Button>
      <p className="text-xs text-muted-foreground">Conversión interna a Cuenta 01: gratis, comisión $0.00. El 100% pasa a tu saldo Empresarial.</p>
      <Button variant="outline" className="w-full" disabled>Retirar a mi banco</Button>
      <p className="text-xs text-muted-foreground">Solo el retiro bancario SPEI cobra 2% de TodoCerca. Transfer.com pendiente de conexión; no se descuenta ninguna comisión mientras el retiro no esté disponible.</p>
    </div>

    {lotes.length > 0 && <div className="space-y-2">
      <div className="text-sm font-semibold">Bonos para mis empleados</div>
      {lotes.map(l => <div key={l.id} className="text-sm flex justify-between"><span>{bonoPorCat(l.categoria)?.nombre} · factura {l.folio_factura}</span><b>${Number(l.saldo_disponible).toFixed(2)} de ${Number(l.monto_total).toFixed(2)}</b></div>)}
      <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={ent.lote} onChange={e => setEnt({ ...ent, lote: e.target.value })}>
        <option value="">Elige un lote</option>
        {lotes.filter(l => Number(l.saldo_disponible) > 0).map(l => <option key={l.id} value={l.id}>{bonoPorCat(l.categoria)?.nombre} · ${Number(l.saldo_disponible).toFixed(2)}</option>)}
      </select>
      <PhoneInput id="tel-empleado" label="Teléfono del empleado" value={ent.tel} onChange={v => setEnt({ ...ent, tel: v })} />
      <Input inputMode="decimal" placeholder="Monto" value={ent.monto} onChange={e => setEnt({ ...ent, monto: e.target.value })} />
      <Button className="w-full" disabled={busy || !ent.lote || !ent.tel || !ent.monto} onClick={async () => {
        if (await rpc('qard_bono_entregar', { _lote: ent.lote, _telefono: ent.tel, _monto: Number(ent.monto), _key: entKey.current }, 'Bono entregado')) { entKey.current = crypto.randomUUID(); setEnt({ lote: ent.lote, tel: '', monto: '' }); }
      }}>Regalar bono</Button>
    </div>}
  </div>;
}
