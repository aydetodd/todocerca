import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type VotacionRow = Database['public']['Tables']['votaciones']['Row'];

type Params = {
  onlyActive?: boolean;
};

export function useVotaciones({ onlyActive = true }: Params = {}) {
  return useQuery<VotacionRow[], Error>({
    queryKey: ['votaciones', onlyActive],
    queryFn: async () => {
      let query = supabase
        .from('votaciones')
        .select('*')
        .eq('is_active', true)
        .order('fecha_fin', { ascending: false });

      // Si onlyActive es false, traer todas incluyendo finalizadas
      // Si es true, igual traemos todas pero ordenamos las activas primero
      // Las votaciones finalizadas se muestran hasta que el creador las elimine

      const { data, error } = await query;

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
