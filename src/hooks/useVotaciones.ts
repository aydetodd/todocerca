import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

export type VotacionRow = Database['public']['Tables']['votaciones']['Row'];

type Params = {
  tipo: 'abierta' | 'cerrada';
  nivel: string | null;
  onlyActive?: boolean;
};

const isActive = (v: VotacionRow) => {
  const activeFlag = v.is_active ?? true;
  const finOk = new Date(v.fecha_fin).getTime() > Date.now();
  return activeFlag && finOk;
};

export function useVotaciones({ tipo, nivel, onlyActive = true }: Params) {
  const { user } = useAuth();

  return useQuery<VotacionRow[], Error>({
    queryKey: ['votaciones', tipo, nivel ?? 'todas', onlyActive, user?.id ?? 'anon'],
    queryFn: async () => {
      if (tipo === 'abierta') {
        let q = supabase
          .from('votaciones')
          .select('*')
          .eq('tipo', 'abierta')
          .order('created_at', { ascending: false });

        if (nivel) q = q.eq('nivel', nivel);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as VotacionRow[];
        return onlyActive ? rows.filter(isActive) : rows;
      }

      // cerrada: solo devolvemos las votaciones donde el usuario es miembro
      if (!user) return [];

      const { data, error } = await supabase
        .from('votacion_miembros')
        .select('votaciones(*)')
        .eq('user_id', user.id);

      if (error) throw new Error(error.message);

      const rows = (data ?? [])
        .map((r: any) => r?.votaciones)
        .filter(Boolean) as VotacionRow[];

      const filtered = nivel ? rows.filter((v) => v.nivel === nivel) : rows;
      const activeFiltered = onlyActive ? filtered.filter(isActive) : filtered;

      return activeFiltered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });
}
