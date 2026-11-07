import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Perm = { id: string; status: string; active: boolean | null; invited_by: string };

/** Shows the user's invited collection terminal on Home, like the driver panel. Hidden when none. */
export default function HomeTerminalPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [perms, setPerms] = useState<Perm[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('terminal_permissions')
      .select('id,status,active,invited_by')
      .eq('user_id', user.id)
      .eq('terminal_code', 'collection')
      .in('status', ['pending', 'accepted']);
    const list = (data ?? []) as Perm[];
    setPerms(list);
    const owners = [...new Set(list.map(p => p.invited_by))];
    if (owners.length) {
      const { data: a } = await supabase.from('terminal_agent_requests').select('user_id,business_name').in('user_id', owners);
      setNames(Object.fromEntries((a ?? []).map((r: any) => [r.user_id, r.business_name || 'Negocio'])));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`home-terminal-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_permissions', filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  if (!perms.length) return null;

  const accept = async (id: string) => {
    setBusy(true); setError('');
    const { error } = await supabase.rpc('terminal_accept', { _id: id } as any);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  return (
    <>
      {perms.map(p => (
        <Card key={p.id} className="border-primary">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CircleDollarSign className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Terminal de cobro</h3>
                <p className="text-sm text-muted-foreground">{names[p.invited_by] ?? 'Negocio'}</p>
                <p className="text-sm text-muted-foreground">
                  {p.status === 'pending' ? 'Te invitaron a cobrar' : p.active ? 'Activa' : 'Teléfono apagado en esta terminal'}
                </p>
              </div>
            </div>
            {p.status === 'pending' && <Button className="w-full" disabled={busy} onClick={() => accept(p.id)}>Aceptar invitación</Button>}
            {p.status === 'accepted' && p.active && <Button className="w-full" onClick={() => navigate('/qard/cobrar?terminal=1')}>Cobrar</Button>}
            {p.status === 'accepted' && !p.active && <p className="text-sm text-muted-foreground">Pide al negocio que encienda tu teléfono en esta terminal.</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
