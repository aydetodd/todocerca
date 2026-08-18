import React from "react";
import { Home, Share2, LayoutGrid, MessageCircle, Heart, Sparkles, Map as MapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

export const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useUnreadMessages();

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

  // Don't show on auth or landing pages
  const hiddenPaths = ['/auth', '/landing', '/'];
  if (hiddenPaths.includes(location.pathname)) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border z-50 safe-area-bottom shadow-[0_-2px_10px_hsl(0_0%_0%_/_0.06)]">
      <div className="w-full flex items-stretch justify-between gap-0 py-2 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none ${isActive('/home') ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[9px] leading-tight truncate max-w-full">Inicio</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/mensajes')}
          className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 relative bg-transparent shadow-none ${isActive('/mensajes') ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <div className="relative">
            <MessageCircle className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[9px] leading-tight truncate max-w-full">Mensajes</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/mi-trazabilidad')}
          className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none ${isActive('/mi-trazabilidad') ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <MapIcon className="h-5 w-5" />
          <span className="text-[9px] leading-tight truncate max-w-full">Mi mapa</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/proximamente')}
          className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none ${isActive('/proximamente') ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-[9px] leading-tight truncate max-w-full">Próximamente</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none text-muted-foreground"
        >
          <Share2 className="h-5 w-5" />
          <span className="text-[9px] leading-tight truncate max-w-full">Compartir</span>
        </Button>


        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none ${isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <LayoutGrid className="h-5 w-5" />
          <span className="text-[9px] leading-tight truncate max-w-full">Panel</span>
        </Button>
      </div>
    </div>
  );
};
