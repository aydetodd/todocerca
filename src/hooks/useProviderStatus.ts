import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type UserStatus = 'available' | 'busy' | 'offline';

// Shared state across all hook instances so every semaphore stays in sync
let globalStatus: UserStatus | null = null;
const listeners = new Set<(s: UserStatus) => void>();

function broadcastStatus(s: UserStatus) {
  globalStatus = s;
  listeners.forEach(fn => fn(s));
}

export function useProviderStatus() {
  const { toast } = useToast();
  const [isProvider, setIsProvider] = useState(false);
  const [status, setStatus] = useState<UserStatus | null>(globalStatus);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Register this instance as a listener for cross-component sync
  useEffect(() => {
    const listener = (s: UserStatus) => {
      if (mountedRef.current) setStatus(s);
    };
    listeners.add(listener);

    // If global state already exists, use it immediately
    if (globalStatus) setStatus(globalStatus);

    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  // Fetch initial status
  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;

      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('role, estado')
        .eq('user_id', user.id)
        .single();

      if (!mountedRef.current) return;

      // Allow ALL users to use the semáforo (not just providers)
      setIsProvider(true);
      const s = (data?.estado as UserStatus) || 'available';
      setStatus(s);
      globalStatus = s;
      listeners.forEach(fn => fn(s));
    };

    checkUserRole();
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`provider_status_sync_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const next = (payload.new as any)?.estado;
          if (next === 'available' || next === 'busy' || next === 'offline') {
            broadcastStatus(next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isProvider]);

  const updateStatus = useCallback(async (newStatus: UserStatus) => {
    if (loading || !userId) return;

    // 1) UI INSTANTÁNEA: broadcast + evento local antes de tocar la red
    broadcastStatus(newStatus);
    try {
      window.dispatchEvent(new CustomEvent(
        newStatus === 'offline' ? 'provider-status-offline' : 'provider-status-active'
      ));
    } catch {}

    // 2) Si pasa a offline, borrar ubicación YA (en paralelo, sin esperar update de profile)
    //    para que el marcador desaparezca al instante en todos los dispositivos.
    if (newStatus === 'offline') {
      supabase.from('proveedor_locations').delete().eq('user_id', userId).then(() => {});
      supabase.from('tracking_member_locations').delete().eq('user_id', userId).then(() => {});
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ estado: newStatus })
        .eq('user_id', userId);

      if (error) throw error;

      const statusText = newStatus === 'offline'
        ? '🔴 Fuera de servicio'
        : newStatus === 'busy'
        ? '🟡 Ocupado'
        : '🟢 Disponible';

      toast({
        title: "Estado actualizado",
        description: statusText,
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loading, userId, toast]);

  return { isProvider, status, loading, updateStatus };
}
