import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Store, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

type Fila = { negocio_id: string | null; nombre: string; cobrado: number; cobros: number; hoy: number };
const mxn = (n: number) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

/** Dinero cobrado por cada sucursal. Cada terminal de cobro queda amarrada a una sola sucursal. */
export default function SucursalesPanel() {
  const { user } = useAuth();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [nombre, setNombre] = useState('');
  const [invitar, setInvitar] = useState<string | null>(null);
  const [tel, setTel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await (supabase.rpc as any)('qard_cobros_por_sucursal');
    setFilas(((data || []) as Fila[]).filter(f => f.negocio_id || Number(f.cobros) > 0));
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase.channel(`suc-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'terminal_operations', filter: `merchant_user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, load]);

  const crear = async () => {
    if (!user || nombre.trim().length < 2) return;
    setBusy(true);
    const { error } = await (supabase.from as any)('qard_negocios').insert({ owner_id: user.id, nombre: nombre.trim() });
    setBusy(false);
    if (error) return toast.error('No se pudo crear la sucursal');
    setNombre(''); void load();
  };

  const enviar = async (id: string) => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)('terminal_invite_sucursal', { _phone: tel, _negocio: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Invitación enviada'); setInvitar(null); setTel('');
  };

  return (
    <div className="space-y-2">
      <div className="font-semibold flex items-center gap-2"><Store className="h-5 w-5 text-primary" />Mis sucursales</div>
      {filas.map(f => (
        <div key={f.negocio_id ?? 'sin'} className="rounded-lg border p-3 space-y-2">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-semibold">{f.nombre}</div>
              <div className="text-xs text-muted-foreground">{f.cobros} cobros · hoy {mxn(f.hoy)}</div>
            </div>
            <div className="text-right"><div className="text-xs text-muted-foreground">Cobrado</div><div className="font-bold text-lg">{mxn(f.cobrado)}</div></div>
          </div>
          {f.negocio_id && (invitar === f.negocio_id ? (
            <div className="space-y-2">
              <PhoneInput value={tel} onChange={setTel} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !tel.trim()} onClick={() => enviar(f.negocio_id!)}>Invitar cajero</Button>
                <Button size="sm" variant="ghost" onClick={() => { setInvitar(null); setTel(''); }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setInvitar(f.negocio_id); setTel(''); }}><UserPlus className="h-4 w-4 mr-1" />Invitar terminal de cobro</Button>
          ))}
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="Ej: Gasolinera Centro" value={nombre} maxLength={80} onChange={e => setNombre(e.target.value)} />
        <Button disabled={busy || nombre.trim().length < 2} onClick={crear}><Plus className="h-4 w-4 mr-1" />Crear</Button>
      </div>
      <p className="text-xs text-muted-foreground">Todo el dinero llega a tu cuenta empresarial; aquí ves cuánto cobró cada sucursal.</p>
    </div>
  );
}
