import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Ticket, ShoppingCart, QrCode, History, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function QrBoletos() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticketCount, setTicketCount] = useState(0);
  const [totalComprado, setTotalComprado] = useState(0);
  const [totalUsado, setTotalUsado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);

  // Handle purchase success/cancel from Stripe redirect
  useEffect(() => {
    const purchase = searchParams.get("purchase");
    const qty = searchParams.get("qty");
    if (purchase === "success" && qty) {
      toast.success(`¡Compra exitosa! Se agregarán ${qty} boletos a tu cuenta.`);
    } else if (purchase === "cancelled") {
      toast.info("Compra cancelada");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetchBalance();
    fetchRecentTickets();
  }, [user]);

  const fetchBalance = async () => {
    const { data, error } = await supabase
      .from("cuentas_boletos")
      .select("ticket_count, total_comprado, total_usado")
      .eq("user_id", user!.id)
      .single();

    if (!error && data) {
      setTicketCount(data.ticket_count);
      setTotalComprado(data.total_comprado);
      setTotalUsado(data.total_usado);
    }
    setLoading(false);
  };

  const fetchRecentTickets = async () => {
    const { data } = await supabase
      .from("qr_tickets")
      .select("id, token, status, generated_at, used_at, is_transferred, transfer_expires_at")
      .eq("user_id", user!.id)
      .order("generated_at", { ascending: false })
      .limit(5);

    if (data) setRecentTickets(data);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  const statusLabel = (t: any) => {
    if (t.status === "used") return <Badge variant="secondary">Usado</Badge>;
    if (t.status === "expired") return <Badge variant="outline">Expirado</Badge>;
    if (t.is_transferred) return <Badge className="bg-amber-600">Transferido</Badge>;
    return <Badge className="bg-green-600">Activo</Badge>;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold text-foreground">QR Boleto Digital</h1>
            <p className="text-xs text-muted-foreground">Transporte Urbano - Hermosillo, Sonora</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Balance Card */}
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-6 text-center">
            <Ticket className="h-10 w-10 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground mb-1">Boletos disponibles</p>
            <p className="text-5xl font-bold text-foreground">{ticketCount}</p>
            <p className="text-xs text-muted-foreground mt-2">Cada boleto vale $9.00 MXN</p>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-auto py-4 flex flex-col gap-1"
            onClick={() => navigate("/wallet/qr-boletos/comprar")}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="text-sm font-semibold">Comprar Boletos</span>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-auto py-4 flex flex-col gap-1"
            onClick={() => navigate("/wallet/qr-boletos/generar")}
          >
            <QrCode className="h-5 w-5" />
            <span className="text-sm font-semibold">Generar QR</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalComprado}</p>
              <p className="text-xs text-muted-foreground">Comprados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalUsado}</p>
              <p className="text-xs text-muted-foreground">Usados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{ticketCount}</p>
              <p className="text-xs text-muted-foreground">Disponibles</p>
            </CardContent>
          </Card>
        </div>

        {/* Info */}
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• Los boletos <strong className="text-foreground">no expiran</strong></p>
            <p>• QR transferidos vencen en <strong className="text-foreground">24 horas</strong></p>
            <p>• Si no se usa, el boleto <strong className="text-foreground">regresa a tu cuenta</strong></p>
          </CardContent>
        </Card>

        {/* Recent Tickets */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Boletos recientes</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/wallet/qr-boletos/historial")}
            className="text-primary"
          >
            Ver todo <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {recentTickets.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Aún no tienes boletos. ¡Compra tus primeros boletos QR!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentTickets.map((t) => (
              <Card key={t.id} className="cursor-pointer hover:bg-secondary/50">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-semibold text-foreground">
                      #{t.token.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.generated_at).toLocaleDateString("es-MX", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>
                  {statusLabel(t)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <NavigationBar />
    </div>
  );
}
