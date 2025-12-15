import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type UserStatus = 'available' | 'busy' | 'offline';

interface GlobalHeaderProps {
  title?: string;
  showLogout?: boolean;
  children?: React.ReactNode;
}

export const GlobalHeader = ({ title = "TodoCerca", showLogout = true, children }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isProvider, setIsProvider] = useState(false);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('role, estado')
        .eq('user_id', user.id)
        .single();

      if (data?.role === 'proveedor') {
        setIsProvider(true);
        setStatus((data.estado as UserStatus) || 'available');
      }
    };

    checkUserRole();
  }, []);

  useEffect(() => {
    if (!userId || !isProvider) return;

    const channel = supabase
      .channel(`header_status_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (payload.new && 'estado' in payload.new) {
            setStatus(payload.new.estado as UserStatus);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isProvider]);

  const updateStatus = async (newStatus: UserStatus) => {
    if (loading || !userId) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ estado: newStatus })
        .eq('user_id', userId);

      if (error) throw error;

      setStatus(newStatus);

      const statusText = newStatus === 'offline'
        ? '🔴 Fuera de servicio'
        : newStatus === 'busy'
        ? '🟡 Ocupado'
        : '🟢 Disponible';

      toast({
        title: "Estado actualizado",
        description: statusText,
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <MapPin className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {children}
          
          {/* Semáforo compacto horizontal para proveedores */}
          {isProvider && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-2 border border-border">
              <button
                onClick={() => updateStatus('available')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'available'
                    ? 'bg-green-500 border-green-300 shadow-[0_0_12px_rgba(34,197,94,0.9)] scale-110'
                    : 'bg-green-950/40 border-green-900/50 hover:bg-green-900/60'
                  }
                `}
                aria-label="Disponible"
                title="Disponible"
              />
              <button
                onClick={() => updateStatus('busy')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'busy'
                    ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_12px_rgba(234,179,8,0.9)] scale-110'
                    : 'bg-yellow-950/40 border-yellow-900/50 hover:bg-yellow-900/60'
                  }
                `}
                aria-label="Ocupado"
                title="Ocupado"
              />
              <button
                onClick={() => updateStatus('offline')}
                disabled={loading}
                className={`
                  w-10 h-10 rounded-full transition-all duration-200 border-2
                  ${status === 'offline'
                    ? 'bg-red-500 border-red-300 shadow-[0_0_12px_rgba(239,68,68,0.9)] scale-110'
                    : 'bg-red-950/40 border-red-900/50 hover:bg-red-900/60'
                  }
                `}
                aria-label="Desconectado"
                title="Desconectado"
              />
            </div>
          )}

          {showLogout && (
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Cerrar sesión">
              <LogOut className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
