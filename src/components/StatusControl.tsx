import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';

type UserStatus = 'available' | 'busy' | 'offline';

export const StatusControl = () => {
  const [status, setStatus] = useState<UserStatus>('offline');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('estado')
        .eq('user_id', user.id)
        .single();

      if (data?.estado) {
        setStatus(data.estado as UserStatus);
      }
    };

    fetchStatus();
  }, []);

  const updateStatus = async (newStatus: UserStatus) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ estado: newStatus })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
    } else {
      setStatus(newStatus);
      toast({
        title: "Estado actualizado",
        description: `Tu estado ahora es: ${newStatus}`,
      });
    }
    setLoading(false);
  };

  return (
    <div className="relative flex flex-col gap-1.5 bg-gray-900/95 rounded-2xl p-2 shadow-xl border border-gray-700 backdrop-blur-sm">
      {/* Green Light - Available (Top) */}
      <button
        onClick={() => updateStatus('available')}
        disabled={loading}
        className={`
          w-9 h-9 rounded-full transition-all duration-300 border-2
          ${status === 'available' 
            ? 'bg-green-500 border-green-300 shadow-[0_0_20px_rgba(34,197,94,1)] scale-105' 
            : 'bg-green-950/30 border-green-950/50 hover:bg-green-950/50'
          }
        `}
        aria-label="Disponible"
      />
      
      {/* Yellow Light - Busy (Middle) */}
      <button
        onClick={() => updateStatus('busy')}
        disabled={loading}
        className={`
          w-9 h-9 rounded-full transition-all duration-300 border-2
          ${status === 'busy' 
            ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_20px_rgba(234,179,8,1)] scale-105' 
            : 'bg-yellow-950/30 border-yellow-950/50 hover:bg-yellow-950/50'
          }
        `}
        aria-label="Ocupado"
      />
      
      {/* Red Light - Offline (Bottom) */}
      <button
        onClick={() => updateStatus('offline')}
        disabled={loading}
        className={`
          w-9 h-9 rounded-full transition-all duration-300 border-2
          ${status === 'offline' 
            ? 'bg-red-500 border-red-300 shadow-[0_0_20px_rgba(239,68,68,1)] scale-105' 
            : 'bg-red-950/30 border-red-950/50 hover:bg-red-950/50'
          }
        `}
        aria-label="Desconectado"
      />
    </div>
  );
};