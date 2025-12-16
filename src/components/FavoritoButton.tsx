import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavoritos } from '@/hooks/useFavoritos';
import { cn } from '@/lib/utils';

interface FavoritoButtonProps {
  tipo: 'producto' | 'proveedor' | 'listing';
  itemId: string;
  precioActual?: number;
  stockActual?: number;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function FavoritoButton({ 
  tipo, 
  itemId, 
  precioActual, 
  stockActual,
  className,
  size = 'icon'
}: FavoritoButtonProps) {
  const { isFavorito, getFavoritoId, addFavorito, removeFavorito } = useFavoritos();
  
  const esFavorito = isFavorito(tipo, itemId);
  const favoritoId = getFavoritoId(tipo, itemId);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (esFavorito && favoritoId) {
      await removeFavorito(favoritoId);
    } else {
      await addFavorito(tipo, itemId, precioActual, stockActual);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      className={cn(
        "hover:bg-transparent",
        esFavorito && "text-red-500",
        className
      )}
    >
      <Heart 
        className={cn(
          "h-5 w-5 transition-all",
          esFavorito && "fill-red-500"
        )} 
      />
    </Button>
  );
}
