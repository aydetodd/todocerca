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
    <div className="flex items-center gap-4 p-4 bg-background border-b">
      <span className="text-sm font-medium">Estado:</span>
      
      {/* Traffic Light Design */}
      <div className="relative flex flex-col gap-2 bg-slate-800 rounded-2xl p-3 shadow-lg border-2 border-slate-700">
        {/* Red Light - Offline */}
        <button
          onClick={() => updateStatus('offline')}
          disabled={loading}
          className={`
            w-12 h-12 rounded-full transition-all duration-300 border-2
            ${status === 'offline' 
              ? 'bg-red-500 border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.8)]' 
              : 'bg-red-900/30 border-red-900/50 hover:bg-red-900/50'
            }
          `}
          aria-label="Desconectado"
        />
        
        {/* Yellow Light - Busy */}
        <button
          onClick={() => updateStatus('busy')}
          disabled={loading}
          className={`
            w-12 h-12 rounded-full transition-all duration-300 border-2
            ${status === 'busy' 
              ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_20px_rgba(234,179,8,0.8)]' 
              : 'bg-yellow-900/30 border-yellow-900/50 hover:bg-yellow-900/50'
            }
          `}
          aria-label="Ocupado"
        />
        
        {/* Green Light - Available */}
        <button
          onClick={() => updateStatus('available')}
          disabled={loading}
          className={`
            w-12 h-12 rounded-full transition-all duration-300 border-2
            ${status === 'available' 
              ? 'bg-green-500 border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.8)]' 
              : 'bg-green-900/30 border-green-900/50 hover:bg-green-900/50'
            }
          `}
          aria-label="Disponible"
        />
      </div>

      {/* Status Label */}
      <span className="text-sm font-semibold">
        {status === 'available' && '🟢 Disponible'}
        {status === 'busy' && '🟡 Ocupado'}
        {status === 'offline' && '🔴 Desconectado'}
      </span>
    </div>
  );
};