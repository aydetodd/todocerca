import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type UserStatus = 'available' | 'busy' | 'offline';

export const StatusControl = () => {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[StatusControl] No user found');
        return;
      }
      
      setUserId(user.id);
      console.log('[StatusControl] User ID:', user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('estado, role')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[StatusControl] Error fetching status:', error);
        return;
      }

      // Si es proveedor y no tiene estado, usar 'available' por defecto
      const currentStatus = data?.estado || (data?.role === 'proveedor' ? 'available' : 'offline');
      console.log('[StatusControl] Current status:', currentStatus);
      setStatus(currentStatus as UserStatus);
    };

    fetchStatus();
  }, []);

  // Suscripción en un useEffect separado que depende de userId
  useEffect(() => {
    if (!userId) return;
    
    const channel = supabase
      .channel(`status_changes_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[StatusControl] Status changed for current user:', payload);
          const next = (payload.new as any)?.estado as UserStatus | null | undefined;
          if (next === 'available' || next === 'busy' || next === 'offline') {
            setStatus(next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const updateStatus = async (newStatus: UserStatus) => {
    if (loading) return;
    
    setLoading(true);
    console.log('[StatusControl] 🔄 Actualizando estado a:', newStatus);

    if (!userId) {
      console.error('[StatusControl] ❌ No hay userId');
      toast({
        title: "Error",
        description: "No se pudo identificar el usuario",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      console.log('[StatusControl] 📝 Ejecutando UPDATE...');
      const { data, error } = await supabase
        .from('profiles')
        .update({ estado: newStatus })
        .eq('user_id', userId)
        .select('estado')
        .single();

      if (error) {
        console.error('[StatusControl] ❌ Error:', error);
        throw error;
      }

      console.log('[StatusControl] ✅ Actualizado exitosamente:', data);
      setStatus(newStatus);
      
      const statusText = newStatus === 'offline' 
        ? '🔴 Fuera de servicio (ROJO) - NO visible en mapa' 
        : newStatus === 'busy' 
        ? '🟡 Ocupado (AMARILLO)' 
        : '🟢 Disponible (VERDE)';
      
      toast({
        title: "✅ Estado actualizado",
        description: statusText,
        duration: 5000,
      });
    } catch (error: any) {
      console.error('[StatusControl] ❌ Exception:', error);
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo actualizar el estado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-row gap-3 bg-gray-900/98 rounded-2xl p-3 shadow-2xl border-2 border-gray-600 backdrop-blur-md">
      {/* Green Light - Available */}
      <button
        onClick={() => updateStatus('available')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'available' 
            ? 'bg-green-500 border-green-300 shadow-[0_0_25px_rgba(34,197,94,1)] scale-110' 
            : 'bg-green-950/40 border-green-950/60 hover:bg-green-950/60'
          }
        `}
        aria-label="Disponible"
        title="Disponible"
      />
      
      {/* Yellow Light - Busy */}
      <button
        onClick={() => updateStatus('busy')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'busy' 
            ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_25px_rgba(234,179,8,1)] scale-110' 
            : 'bg-yellow-950/40 border-yellow-950/60 hover:bg-yellow-950/60'
          }
        `}
        aria-label="Ocupado"
        title="Ocupado"
      />
      
      {/* Red Light - Offline */}
      <button
        onClick={() => updateStatus('offline')}
        disabled={loading}
        className={`
          w-14 h-14 rounded-full transition-all duration-300 border-2
          ${status === 'offline' 
            ? 'bg-red-500 border-red-300 shadow-[0_0_25px_rgba(239,68,68,1)] scale-110' 
            : 'bg-red-950/40 border-red-950/60 hover:bg-red-950/60'
          }
        `}
        aria-label="Desconectado"
        title="Desconectado"
      />
    </div>
  );
};