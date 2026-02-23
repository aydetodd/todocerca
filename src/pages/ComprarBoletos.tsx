import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Minus, Plus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TICKET_PRICE = 9.0;
const QUICK_OPTIONS = [5, 10, 20];

export default function ComprarBoletos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(5);
  const [purchasing, setPurchasing] = useState(false);

  const total = quantity * TICKET_PRICE;

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 1 && num <= 100) {
      setQuantity(num);
    } else if (value === "") {
      setQuantity(1);
    }
  };

  const handlePurchase = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-tickets", {
        body: { quantity },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No se recibió URL de pago");
      }
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast.error(error.message || "Error al procesar la compra");
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold text-foreground">Comprar Boletos QR</h1>
            <p className="text-xs text-muted-foreground">Transporte Urbano - Hermosillo</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quantity Input */}
        <Card>
          <CardContent className="p-6">
            <label className="text-sm font-medium text-foreground mb-3 block">
              ¿Cuántos boletos deseas comprar?
            </label>
            <div className="flex items-center justify-center gap-4 mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="w-24 text-center text-3xl font-bold h-16"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.min(100, quantity + 1))}
                disabled={quantity >= 100}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Options */}
            <div className="flex gap-2 justify-center">
              {QUICK_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  variant={quantity === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuantity(opt)}
                >
                  {opt} boletos
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Price Summary */}
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Precio por boleto</span>
                <span>$9.00 MXN</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Cantidad</span>
                <span>× {quantity}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">
                  ${total.toFixed(2)} MXN
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• Pago seguro con tarjeta vía Stripe</p>
            <p>• Los boletos se acreditan inmediatamente</p>
            <p>• Sin comisiones adicionales — pagas $9.00 por boleto</p>
            <p>• Los boletos no expiran</p>
          </CardContent>
        </Card>

        {/* Purchase Button */}
        <Button
          className="w-full h-14 text-lg"
          size="lg"
          onClick={handlePurchase}
          disabled={purchasing || quantity < 1}
        >
          {purchasing ? (
            <span className="animate-pulse">Procesando...</span>
          ) : (
            <>
              <CreditCard className="h-5 w-5 mr-2" />
              Pagar ${total.toFixed(2)} MXN
            </>
          )}
        </Button>
      </div>

      <NavigationBar />
    </div>
  );
}
