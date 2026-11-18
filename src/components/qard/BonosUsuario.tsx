import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { bonoPorIndice } from '@/lib/qardBonos';
import QardTarjeta from './QardTarjeta';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';

type Sub = { id: string; sub_index: number; qard_number: string; alias: string; estado: string; saldo_mxn: number };
type Mov = { id: string; tipo: string; monto_mxn: number; created_at: string; descripcion: string | null; sub_qr_id: string | null };

const fmt = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ');
const ETQ: Record<string, string> = { bono_recibido: 'Bono recibido', bono_pago: 'Pago en comercio', transferencia_p2p_in: 'Transferencia recibida', transferencia_p2p_out: 'Transferencia enviada' };

/** Tarjetas de bono 02–06. Solo pagan en comercios con el sello de su categoría. */
export default function BonosUsuario({ subs, onChanged }: { subs: Sub[]; onChanged: () => void }) {
  const { toast } = useToast();
  const bonos = subs.filter(s => s.sub_index >= 2 && s.sub_index <= 10);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [pagar, setPagar] = useState<string | null>(null);
  const [qr, setQr] = useState<Sub | null>(null);
  const [comercio, setComercio] = useState(''); const [monto, setMonto] = useState(''); const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef<string>(crypto.randomUUID());
  const ids = bonos.map(b => b.id).join(',');

  useEffect(() => {
    if (!ids) return;
    void (async () => {
      const { data } = await supabase.from('qard_movimientos').select('id,tipo,monto_mxn,created_at,descripcion,sub_qr_id').in('sub_qr_id', ids.split(',')).order('created_at', { ascending: false }).limit(30);
      const list = (data ?? []) as Mov[]; setMovs(list);
      if (list.length) {
        const { data: h } = await supabase.from('qard_tcb_cadena' as any).select('movimiento_id,hash').in('movimiento_id', list.map(m => m.id));
        setHashes(Object.fromEntries(((h ?? []) as any[]).map(r => [r.movimiento_id, r.hash])));
      }
    })();
  }, [ids]);

  if (!bonos.length) return null;

  const enviar = async (b: Sub) => {
    setBusy(true);
    const { error } = await supabase.rpc('qard_bono_pagar' as any, { _from: b.qard_number, _merchant: comercio.replace(/\D/g, ''), _amount: Number(monto), _cvv: cvv, _key: key.current });
    setBusy(false);
    if (error) return toast({ title: 'No se pudo pagar', description: error.message, variant: 'destructive' });
    key.current = crypto.randomUUID(); setPagar(null); setComercio(''); setMonto(''); setCvv('');
    toast({ title: 'Pago con bono confirmado' }); onChanged();
  };

  return <div className="space-y-3">
    <h3 className="font-bold text-lg">Mis bonos</h3>
    {bonos.map(b => {
      const info = bonoPorIndice(b.sub_index); const apagada = b.estado !== 'activa';
      return <div key={b.id} className="space-y-2 border-b pb-4">
        <QardTarjeta numero={b.qard_number} nombre="" indice={b.sub_index} estado={b.estado} saldo={Number(b.saldo_mxn)} activada={!apagada} cvvVisible={false} compactControls onVerCvv={() => {}} onRotarCvv={() => {}} onQr={() => setQr(b)} />
        <div className="flex items-center justify-between gap-2">
          <div><div className="font-semibold">{info?.emoji} {b.alias} · {String(b.sub_index).padStart(2, '0')}</div><div className="text-xs font-mono text-muted-foreground">{fmt(b.qard_number)}</div></div>
          <div className="text-right"><div className="text-xl font-bold">${Number(b.saldo_mxn).toFixed(2)}</div>{apagada && <div className="text-xs">Apagada</div>}</div>
        </div>
        {apagada ? <p className="text-xs text-muted-foreground">Esta tarjeta todavía no está habilitada.</p> :
          pagar === b.id ? <div className="space-y-2">
            <Input inputMode="numeric" placeholder="Número Empresarial del comercio (16 dígitos)" value={comercio} onChange={e => setComercio(e.target.value)} />
            <div className="grid grid-cols-2 gap-2"><Input inputMode="decimal" placeholder="Monto" value={monto} onChange={e => setMonto(e.target.value)} /><Input inputMode="numeric" maxLength={3} placeholder="CVV 3 dígitos" value={cvv} onChange={e => setCvv(e.target.value)} /></div>
            <div className="flex gap-2"><Button className="flex-1" disabled={busy} onClick={() => void enviar(b)}>Pagar</Button><Button variant="outline" onClick={() => setPagar(null)}>Cancelar</Button></div>
            <p className="text-xs text-muted-foreground">Solo funciona en comercios con el sello "Acepta {info?.nombre}".</p>
          </div> : <Button variant="outline" className="w-full" disabled={Number(b.saldo_mxn) <= 0} onClick={() => setPagar(b.id)}>Pagar en comercio</Button>}
      </div>;
    })}
    <Dialog open={!!qr} onOpenChange={open => { if (!open) setQr(null); }}><DialogContent><DialogHeader><DialogTitle>{qr?.alias}</DialogTitle></DialogHeader>{qr && <div className="flex justify-center"><QRCodeSVG value={qr.qard_number} size={240} /></div>}</DialogContent></Dialog>
    {movs.length > 0 && <div className="rounded-xl border p-3 space-y-2">
      <div className="text-sm font-semibold">Movimientos de bonos</div>
      {movs.map(m => <div key={m.id} className="flex justify-between gap-2 text-sm border-b last:border-0 pb-1">
        <div><div>{ETQ[m.tipo] ?? 'Movimiento'}</div>{hashes[m.id] && <div className="text-[10px] font-mono text-muted-foreground">Huella {hashes[m.id].slice(0, 12)}…</div>}</div>
        <div className="font-semibold">{['bono_recibido', 'transferencia_p2p_in'].includes(m.tipo) ? '+' : '−'}${Number(m.monto_mxn).toFixed(2)}</div>
      </div>)}
    </div>}
  </div>;
}
