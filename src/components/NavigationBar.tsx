import React from "react";
import { Home, Heart, Share2 } from "lucide-react";
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
        // Fallback: copiar al portapapeles
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Enlace copiado al portapapeles");
      }
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  };

  const handleFavorites = () => {
    navigate('/favoritos');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
      <div className="container flex items-center justify-around py-1.5">
        <Button
          variant={location.pathname === '/' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-0.5 h-auto py-1"
        >
          <Home className="h-4 w-4" />
          <span className="text-[10px]">Inicio</span>
        </Button>
        
        <Button
          variant={location.pathname === '/favoritos' ? 'default' : 'ghost'}
          size="icon"
          onClick={handleFavorites}
          className="flex flex-col items-center gap-0.5 h-auto py-1"
        >
          <Heart className="h-4 w-4" />
          <span className="text-[10px]">Favoritos</span>
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 h-auto py-1"
        >
          <Share2 className="h-4 w-4" />
          <span className="text-[10px]">Compartir</span>
        </Button>
      </div>
    </div>
  );
};
