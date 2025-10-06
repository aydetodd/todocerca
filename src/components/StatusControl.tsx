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

  const statusConfig = {
    available: {
      label: 'Disponible',
      color: 'bg-green-500 hover:bg-green-600',
      activeColor: 'bg-green-600'
    },
    busy: {
      label: 'Ocupado',
      color: 'bg-yellow-500 hover:bg-yellow-600',
      activeColor: 'bg-yellow-600'
    },
    offline: {
      label: 'Desconectado',
      color: 'bg-red-500 hover:bg-red-600',
      activeColor: 'bg-red-600'
    }
  };

  return (
    <div className="flex gap-2 p-4 bg-background border-b">
      <span className="text-sm font-medium self-center mr-2">Estado:</span>
      {(Object.keys(statusConfig) as UserStatus[]).map((s) => (
        <Button
          key={s}
          size="sm"
          disabled={loading}
          onClick={() => updateStatus(s)}
          className={`
            ${status === s ? statusConfig[s].activeColor : statusConfig[s].color}
            text-white
          `}
        >
          {statusConfig[s].label}
        </Button>
      ))}
    </div>
  );
};