import { useState, useCallback } from 'react';

export interface CartItem {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  unit: string;
  personIndex: number; // Índice de la persona (0 = Persona 1, 1 = Persona 2, etc.)
}

export const useShoppingCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [numPeople, setNumPeople] = useState<number>(1); // Número de personas en el pedido

  const addToCart = useCallback((product: Omit<CartItem, 'cantidad'>, quantity: number = 1) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(
        item => item.id === product.id && item.personIndex === product.personIndex
      );
      
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id && item.personIndex === product.personIndex
            ? { ...item, cantidad: item.cantidad + quantity }
            : item
        );
      }
      
      return [...prevCart, { ...product, cantidad: quantity }];
    });
  }, []);

  const addPerson = useCallback(() => {
    setNumPeople(prev => prev + 1);
  }, []);

  const removePerson = useCallback((personIndex: number) => {
    if (numPeople <= 1) return;
    
    // Remover todos los items de esa persona
    setCart(prevCart => 
      prevCart
        .filter(item => item.personIndex !== personIndex)
        .map(item => ({
          ...item,
          personIndex: item.personIndex > personIndex ? item.personIndex - 1 : item.personIndex
        }))
    );
    
    setNumPeople(prev => prev - 1);
  }, [numPeople]);

  const removeFromCart = useCallback((productId: string, personIndex: number) => {
    setCart(prevCart => prevCart.filter(
      item => !(item.id === productId && item.personIndex === personIndex)
    ));
  }, []);

  const updateQuantity = useCallback((productId: string, personIndex: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId, personIndex);
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId && item.personIndex === personIndex
          ? { ...item, cantidad: quantity }
          : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setNumPeople(1);
  }, []);

  const getTotal = useCallback(() => {
    return cart.reduce((total, item) => total + (item.precio * item.cantidad), 0);
  }, [cart]);

  const getItemCount = useCallback(() => {
    return cart.reduce((count, item) => count + item.cantidad, 0);
  }, [cart]);

  return {
    cart,
    numPeople,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotal,
    getItemCount,
    addPerson,
    removePerson,
  };
};
