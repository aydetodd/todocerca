import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, CreditCard, GraduationCap, UserRound, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";

import { useAuth } from "@/hooks/useAuth";
import { useCurrentCity } from "@/hooks/useCurrentCity";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TICKET_PRICE_NORMAL = 9.0;
const TICKET_PRICE_DESCUENTO = 4.5;

type DiscountType = "normal" | "estudiante" | "tercera_edad";

export default function ComprarBoletos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { location: gpsLocation } = useCurrentCity();
  const [quantity, setQuantity] = useState(10);
  const [purchasing, setPurchasing] = useState(false);
  const [approvedDiscount, setApprovedDiscount] = useState<DiscountType>("normal");
  const [loadingDiscount, setLoadingDiscount] = useState(true);

  // Resolve city: prioritize user's manual search selection, fallback to GPS
  const cityLabel = useMemo(() => {
    const searchCiudad = localStorage.getItem('lastSearchCiudad') || '';
    const searchEstado = localStorage.getItem('lastSearchEstado') || '';
    if (searchCiudad && searchEstado) return `${searchCiudad}, ${searchEstado}`;
    if (searchCiudad) return searchCiudad;
    if (gpsLocation?.ciudad && gpsLocation?.estado) return `${gpsLocation.ciudad}, ${gpsLocation.estado}`;
    if (gpsLocation?.ciudad) return gpsLocation.ciudad;
    return 'tu ciudad';
  }, [gpsLocation]);

  useEffect(() => {
    if (user) checkDiscount();
    else setLoadingDiscount(false);
  }, [user]);

  const checkDiscount = async () => {
    const { data } = await (supabase
      .from("verificaciones_descuento") as any)
      .select("tipo, estado")
      .eq("user_id", user!.id)
      .eq("estado", "aprobado");

    if (data && data.length > 0) {
      // Use the first approved discount found
      setApprovedDiscount(data[0].tipo as DiscountType);
    }
    setLoadingDiscount(false);
  };

  const isDiscounted = approvedDiscount !== "normal";
  const ticketPrice = isDiscounted ? TICKET_PRICE_DESCUENTO : TICKET_PRICE_NORMAL;
  const total = quantity * ticketPrice;

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 10 && num <= 100) {
      setQuantity(num);
    } else if (value === "") {
      setQuantity(10);
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
        body: { 
          quantity, 
          ticket_type: approvedDiscount,
          device_id: localStorage.getItem("tc_device_id") || undefined,
          city_label: cityLabel,
        },
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
            <h1 className="text-lg font-bold text-foreground">Comprar Códigos QR</h1>
            <p className="text-xs text-muted-foreground">Transporte Urbano</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* City scope banner — large & bold */}
        <Card className="border-primary/40 bg-primary/10">
          <CardContent className="p-4 flex items-start gap-3">
            <MapPin className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-extrabold text-foreground leading-tight">
                Estos boletos son válidos SOLO en el transporte público de {cityLabel}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                El precio aplica a la tarifa local. No se pueden usar en otra ciudad.
              </p>
            </div>
          </CardContent>
        </Card>
        {/* Discount badge */}
        {isDiscounted && (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="p-3 flex items-center gap-3">
              {approvedDiscount === "estudiante" ? (
                <GraduationCap className="h-5 w-5 text-blue-500" />
              ) : (
                <UserRound className="h-5 w-5 text-amber-500" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Descuento {approvedDiscount === "estudiante" ? "Estudiante" : "Tercera Edad"} activo
                </p>
                <p className="text-xs text-muted-foreground">50% de descuento · $4.50 MXN por boleto</p>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">-50%</Badge>
            </CardContent>
          </Card>
        )}

        {/* Link to request discount */}
        {!isDiscounted && !loadingDiscount && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => navigate("/wallet/qr-boletos/descuento")}
          >
            <ShieldCheck className="h-4 w-4 mr-1" />
            ¿Eres estudiante o adulto mayor? Solicita tu descuento
          </Button>
        )}

        {/* Quantity Input */}
        <Card>
          <CardContent className="p-6">
            <label className="text-sm font-medium text-foreground mb-3 block">
              ¿Cuántos códigos QR deseas comprar?
            </label>
            <div className="flex items-center justify-center gap-4 mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(10, quantity - 1))}
                disabled={quantity <= 10}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={10}
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
          </CardContent>
        </Card>

        {/* Price Summary */}
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Precio por código QR</span>
                <span>
                  {isDiscounted && (
                    <span className="line-through mr-2 text-muted-foreground/50">$9.00</span>
                  )}
                  ${ticketPrice.toFixed(2)} MXN
                </span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Cantidad</span>
                <span>× {quantity}</span>
              </div>
              {isDiscounted && (
                <div className="flex justify-between text-sm text-green-500">
                  <span>Ahorro total</span>
                  <span>-${(quantity * (TICKET_PRICE_NORMAL - TICKET_PRICE_DESCUENTO)).toFixed(2)} MXN</span>
                </div>
              )}
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
            <p>• Los códigos QR se generan <strong className="text-foreground">automáticamente</strong></p>
            <p>• Sin comisiones adicionales — pagas ${ticketPrice.toFixed(2)} por QR</p>
            <p>• Los QR no expiran hasta que se usen</p>
            {isDiscounted && (
              <p className="text-amber-500">• ⚠️ Los boletos con descuento NO se pueden transferir</p>
            )}
          </CardContent>
        </Card>

        {/* Purchase Button */}
        <Button
          className="w-full h-14 text-lg"
          size="lg"
          onClick={handlePurchase}
          disabled={purchasing || quantity < 1 || loadingDiscount}
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
    </div>
  );
}
