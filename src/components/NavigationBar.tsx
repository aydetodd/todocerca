import React from "react";
import { Home, Share2, LayoutGrid, MessageCircle } from "lucide-react";
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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50 safe-area-bottom">
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
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
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
