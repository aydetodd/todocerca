import { ShoppingCart as CartIcon, Plus, Minus, Trash2, Send, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CartItem } from '@/hooks/useShoppingCart';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ShoppingCartProps {
  cart: CartItem[];
  numPeople: number;
  onUpdateQuantity: (productId: string, personIndex: number, quantity: number) => void;
  onRemoveItem: (productId: string, personIndex: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  total: number;
  itemCount: number;
}

export const ShoppingCart = ({
  cart,
  numPeople,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
  total,
  itemCount,
}: ShoppingCartProps) => {
  // Agrupar items por persona
  const itemsByPerson = Array.from({ length: numPeople }, (_, index) => ({
    personIndex: index,
    items: cart.filter(item => item.personIndex === index)
  }));
  if (cart.length === 0) {
    return (
      <Card className="sticky top-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CartIcon className="h-5 w-5" />
          Pedido
        </CardTitle>
      </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Tu carrito está vacío
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CartIcon className="h-5 w-5" />
            Pedido
            <Badge variant="secondary">{itemCount}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCart}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Pedido para {numPeople} persona{numPeople > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-6">
          <div className="space-y-6">
            {itemsByPerson.map(({ personIndex, items }) => (
              <div key={personIndex} className="border rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Persona {personIndex + 1}
                  </h3>
                </div>
                
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Sin productos
                  </p>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div key={`${item.id}-${item.personIndex}`} className="flex items-start gap-3 pb-3 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{item.nombre}</h4>
                          <p className="text-sm text-muted-foreground">
                            ${item.precio} / {item.unit}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => onUpdateQuantity(item.id, item.personIndex, item.cantidad - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-sm font-medium w-8 text-center">
                              {item.cantidad}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => onUpdateQuantity(item.id, item.personIndex, item.cantidad + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">
                            ${(item.precio * item.cantidad).toFixed(2)}
                          </p>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 mt-1"
                            onClick={() => onRemoveItem(item.id, item.personIndex)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex-col gap-4">
        <div className="w-full flex items-center justify-between text-lg font-bold">
          <span>Total:</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <Button className="w-full" size="lg" onClick={onCheckout}>
          <Send className="h-4 w-4 mr-2" />
          Enviar Pedido por WhatsApp
        </Button>
      </CardFooter>
    </Card>
  );
};
