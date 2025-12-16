import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Favorito {
  id: string;
  user_id: string;
  tipo: 'producto' | 'proveedor' | 'listing';
  producto_id: string | null;
  proveedor_id: string | null;
  listing_id: string | null;
  precio_guardado: number | null;
  stock_guardado: number | null;
  created_at: string;
  // Joined data
  producto?: {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number;
    stock: number;
    unit: string | null;
    proveedor_id: string;
  };
  proveedor?: {
    id: string;
    nombre: string;
    telefono: string | null;
    latitude: number | null;
    longitude: number | null;
    user_id: string;
  };
  listing?: {
    id: string;
    title: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    is_active: boolean;
    expires_at: string;
  };
}

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchFavoritos();
      subscribeToChanges();
    }
  }, [userId]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
    if (!user) setLoading(false);
  };

  const fetchFavoritos = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('favoritos')
        .select(`
          *,
          producto:productos(id, nombre, descripcion, precio, stock, unit, proveedor_id),
          proveedor:proveedores(id, nombre, telefono, latitude, longitude, user_id),
          listing:listings(id, title, description, latitude, longitude, is_active, expires_at)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFavoritos((data || []) as Favorito[]);
    } catch (error) {
      console.error('Error fetching favoritos:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToChanges = () => {
    const channel = supabase
      .channel('favoritos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'favoritos',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchFavoritos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const addFavorito = async (
    tipo: 'producto' | 'proveedor' | 'listing',
    itemId: string,
    precioActual?: number,
    stockActual?: number
  ) => {
    if (!userId) {
      toast.error('Debes iniciar sesión para guardar favoritos');
      return false;
    }

    try {
      const insertData: any = {
        user_id: userId,
        tipo,
        precio_guardado: precioActual || null,
        stock_guardado: stockActual || null
      };

      if (tipo === 'producto') insertData.producto_id = itemId;
      if (tipo === 'proveedor') insertData.proveedor_id = itemId;
      if (tipo === 'listing') insertData.listing_id = itemId;

      const { error } = await supabase
        .from('favoritos')
        .insert(insertData);

      if (error) {
        if (error.code === '23505') {
          toast.info('Ya está en tus favoritos');
          return false;
        }
        throw error;
      }

      toast.success('Agregado a favoritos');
      return true;
    } catch (error) {
      console.error('Error adding favorito:', error);
      toast.error('Error al agregar a favoritos');
      return false;
    }
  };

  const removeFavorito = async (favoritoId: string) => {
    try {
      const { error } = await supabase
        .from('favoritos')
        .delete()
        .eq('id', favoritoId);

      if (error) throw error;
      toast.success('Eliminado de favoritos');
      return true;
    } catch (error) {
      console.error('Error removing favorito:', error);
      toast.error('Error al eliminar de favoritos');
      return false;
    }
  };

  const isFavorito = (tipo: 'producto' | 'proveedor' | 'listing', itemId: string): boolean => {
    return favoritos.some(f => {
      if (tipo === 'producto') return f.producto_id === itemId;
      if (tipo === 'proveedor') return f.proveedor_id === itemId;
      if (tipo === 'listing') return f.listing_id === itemId;
      return false;
    });
  };

  const getFavoritoId = (tipo: 'producto' | 'proveedor' | 'listing', itemId: string): string | null => {
    const fav = favoritos.find(f => {
      if (tipo === 'producto') return f.producto_id === itemId;
      if (tipo === 'proveedor') return f.proveedor_id === itemId;
      if (tipo === 'listing') return f.listing_id === itemId;
      return false;
    });
    return fav?.id || null;
  };

  // Check for price/stock changes
  const getChangedFavoritos = () => {
    return favoritos.filter(f => {
      if (f.tipo === 'producto' && f.producto) {
        const precioChanged = f.precio_guardado !== null && f.producto.precio !== f.precio_guardado;
        const stockChanged = f.stock_guardado !== null && f.producto.stock !== f.stock_guardado;
        return precioChanged || stockChanged;
      }
      return false;
    });
  };

  return {
    favoritos,
    loading,
    userId,
    addFavorito,
    removeFavorito,
    isFavorito,
    getFavoritoId,
    getChangedFavoritos,
    refresh: fetchFavoritos
  };
}
