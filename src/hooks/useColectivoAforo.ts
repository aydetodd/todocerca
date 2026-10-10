import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Same live occupancy source for passenger search and driver maps. */
export function useColectivoAforo() {
  const [aforo, setAforo] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    let revision = 0;
    let request = 0;
    const load = async () => {
      const startedAt = revision;
      const id = ++request;
      const { data, error } = await supabase.rpc('get_aforo_colectivo' as any);
      if (!alive || error || startedAt !== revision || id !== request) return;
      const next: Record<string, number> = {};
      for (const row of (data || []) as { user_id: string; a_bordo: number }[]) {
        const count = Number(row.a_bordo);
        if (row.user_id && Number.isFinite(count)) next[row.user_id] = count;
      }
      setAforo(next);
    };
    const channel = supabase.channel('aforo-colectivo')
      .on('broadcast', { event: 'aforo' }, ({ payload }) => {
        if (typeof payload?.user_id !== 'string') return;
        const count = Number(payload.a_bordo);
        if (payload.a_bordo !== null && !Number.isFinite(count)) return;
        revision++;
        setAforo(previous => {
          const next = { ...previous };
          if (payload.a_bordo === null) delete next[payload.user_id];
          else next[payload.user_id] = count;
          return next;
        });
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void load(); });
    void load();
    const timer = window.setInterval(load, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);
  return aforo;
}