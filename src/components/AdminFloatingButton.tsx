import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const HIDDEN_PATHS = ['/auth', '/landing', '/beto', '/admin'];

export const AdminFloatingButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('consecutive_number')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(data?.consecutive_number === 1);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!isAdmin) return null;
  if (HIDDEN_PATHS.includes(location.pathname)) return null;

  return (
    <button
      onClick={() => navigate('/beto')}
      aria-label="Panel de administrador"
      title="Panel de administrador"
      className="fixed right-4 bottom-24 z-[60] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
    >
      <ShieldCheck className="h-7 w-7" />
    </button>
  );
};
