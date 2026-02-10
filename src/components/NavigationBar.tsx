import React, { useEffect, useState } from "react";
import { Home, Share2, LayoutGrid, MessageCircle, ShoppingCart, Car, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { supabase } from "@/integrations/supabase/client";

export const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useUnreadMessages();
  const [badges, setBadges] = useState({ apartados: 0, citas: 0, taxi: 0 });
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isTaxi, setIsTaxi] = useState(false);
  const [activeSosCount, setActiveSosCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('provider_type')
        .eq('user_id', user.id)
        .maybeSingle();

      setIsTaxi(profile?.provider_type === 'taxi');

      const { data: prov } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (prov) setProveedorId(prov.id);
    };
    init();
  }, []);

  // Fetch badge counts
  useEffect(() => {
    if (!userId) return;

    const fetchCounts = async () => {
      const newBadges = { apartados: 0, citas: 0, taxi: 0 };

      if (proveedorId) {
        const { count: oCount } = await supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .eq('proveedor_id', proveedorId)
          .eq('estado', 'pendiente');
        newBadges.apartados = oCount || 0;

        const { count: cCount } = await supabase
          .from('citas')
          .select('*', { count: 'exact', head: true })
          .eq('proveedor_id', proveedorId)
          .eq('estado', 'pendiente');
        newBadges.citas = cCount || 0;
      }

      if (isTaxi) {
        const { count: tCount } = await supabase
          .from('taxi_requests')
          .select('*', { count: 'exact', head: true })
          .eq('driver_id', userId)
          .eq('status', 'pending');
        newBadges.taxi = tCount || 0;
      }

      setBadges(newBadges);
    };

    // Active SOS alerts count
    const fetchSos = async () => {
      const { count } = await supabase
        .from('sos_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .eq('status', 'active');
      setActiveSosCount(count || 0);
    };

    fetchCounts();
    fetchSos();

    const channels: ReturnType<typeof supabase.channel>[] = [];

    if (proveedorId) {
      channels.push(
        supabase.channel('nav-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `proveedor_id=eq.${proveedorId}` }, () => fetchCounts()).subscribe(),
        supabase.channel('nav-citas').on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `proveedor_id=eq.${proveedorId}` }, () => fetchCounts()).subscribe()
      );
    }
    if (isTaxi) {
      channels.push(
        supabase.channel('nav-taxi').on('postgres_changes', { event: '*', schema: 'public', table: 'taxi_requests', filter: `driver_id=eq.${userId}` }, () => fetchCounts()).subscribe()
      );
    }
    channels.push(
      supabase.channel('nav-sos').on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts', filter: `user_id=eq.${userId}` }, () => fetchSos()).subscribe()
    );

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [userId, proveedorId, isTaxi]);

  const handleShare = async () => {
    const shareData = {
      title: 'TodoCerca',
      text: 'Descubre productos y servicios cerca de ti',
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Enlace copiado al portapapeles");
      }
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const BadgeIndicator = ({ count }: { count: number }) => {
    if (count <= 0) return null;
    return (
      <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
        {count > 9 ? '9+' : count}
      </span>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50 safe-area-bottom">
      {/* Top row: Apartados, Taxi, Citas, SOS */}
      <div className="container flex items-center justify-around py-1 border-b border-border/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard?section=apartados')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
        >
          <div className="relative">
            <ShoppingCart className="h-4 w-4" />
            <BadgeIndicator count={badges.apartados} />
          </div>
          <span className="text-[9px]">Apartados</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard?section=taxi')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
        >
          <div className="relative">
            <Car className="h-4 w-4" />
            <BadgeIndicator count={badges.taxi} />
          </div>
          <span className="text-[9px]">Taxi</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard?section=citas')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
        >
          <div className="relative">
            <Calendar className="h-4 w-4" />
            <BadgeIndicator count={badges.citas} />
          </div>
          <span className="text-[9px]">Citas</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/sos')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3 text-destructive hover:text-destructive"
        >
          <div className="relative">
            <AlertTriangle className="h-4 w-4" />
            <BadgeIndicator count={activeSosCount} />
          </div>
          <span className="text-[9px]">SOS</span>
        </Button>
      </div>

      {/* Bottom row: Inicio, Mensajes, Compartir, Panel */}
      <div className="container flex items-center justify-around py-2">
        <Button
          variant={isActive('/home') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/home')}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-3"
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Inicio</span>
        </Button>
        
        <Button
          variant={isActive('/mensajes') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/mensajes')}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 relative"
        >
          <div className="relative">
            <MessageCircle className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px]">Mensajes</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-3"
        >
          <Share2 className="h-5 w-5" />
          <span className="text-[10px]">Compartir</span>
        </Button>

        <Button
          variant={isActive('/dashboard') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-3"
        >
          <LayoutGrid className="h-5 w-5" />
          <span className="text-[10px]">Panel</span>
        </Button>
      </div>
    </div>
  );
};
