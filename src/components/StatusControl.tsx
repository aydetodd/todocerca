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
    <div className="relative flex flex-col gap-1 bg-black/80 rounded-full p-2 shadow-xl border border-gray-700 backdrop-blur-sm">
      {/* Green Light - Available */}
      <button
        onClick={() => updateStatus('available')}
        disabled={loading}
        className={`
          w-7 h-7 rounded-full transition-all duration-300 border
          ${status === 'available' 
            ? 'bg-green-400 border-green-200 shadow-[0_0_20px_rgba(34,197,94,0.9)] scale-110' 
            : 'bg-green-950/40 border-green-950/60 hover:bg-green-950/60'
          }
        `}
        aria-label="Disponible"
      />
      
      {/* Yellow Light - Busy */}
      <button
        onClick={() => updateStatus('busy')}
        disabled={loading}
        className={`
          w-7 h-7 rounded-full transition-all duration-300 border
          ${status === 'busy' 
            ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_20px_rgba(234,179,8,0.9)] scale-110' 
            : 'bg-yellow-950/40 border-yellow-950/60 hover:bg-yellow-950/60'
          }
        `}
        aria-label="Ocupado"
      />
      
      {/* Red Light - Offline */}
      <button
        onClick={() => updateStatus('offline')}
        disabled={loading}
        className={`
          w-7 h-7 rounded-full transition-all duration-300 border
          ${status === 'offline' 
            ? 'bg-red-500 border-red-200 shadow-[0_0_20px_rgba(239,68,68,0.9)] scale-110' 
            : 'bg-red-950/40 border-red-950/60 hover:bg-red-950/60'
          }
        `}
        aria-label="Desconectado"
      />
    </div>
  );
};