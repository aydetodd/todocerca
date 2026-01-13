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
        .order('fecha_fin', { ascending: true });

      if (onlyActive) {
        query = query.eq('is_active', true).gte('fecha_fin', new Date().toISOString());
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
