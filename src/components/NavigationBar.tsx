import React from "react";
import { Home, Heart, Share2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

export const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-4"
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Inicio</span>
        </Button>
        
        <Button
          variant={isActive('/favoritos') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/favoritos')}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-4"
        >
          <Heart className="h-5 w-5" />
          <span className="text-[10px]">Favoritos</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-4"
        >
          <Share2 className="h-5 w-5" />
          <span className="text-[10px]">Compartir</span>
        </Button>

        <Button
          variant={isActive('/panel') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/panel')}
          className="flex flex-col items-center gap-0.5 h-auto py-2 px-4"
        >
          <LayoutGrid className="h-5 w-5" />
          <span className="text-[10px]">Panel</span>
        </Button>
      </div>
    </div>
  );
};
