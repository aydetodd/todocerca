import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Ticket, ShoppingCart, QrCode, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function QrBoletos() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticketCount, setTicketCount] = useState(0);
  const [totalComprado, setTotalComprado] = useState(0);
  const [activeQrCount, setActiveQrCount] = useState(0);
  const [firstActiveTicket, setFirstActiveTicket] = useState<any>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [loading, setLoading] = useState(true);

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
    fetchActiveQrs();
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
    }
    setLoading(false);
  };

  const fetchActiveQrs = async () => {
    const { data, count } = await supabase
      .from("qr_tickets")
      .select("*", { count: "exact" })
      .eq("user_id", user!.id)
      .eq("status", "active")
      .order("generated_at", { ascending: true });

    if (data) {
      setActiveQrCount(data.length);
      setFirstActiveTicket(data.length > 0 ? data[0] : null);
    }
  };

  const handleShowQr = () => {
    if (firstActiveTicket) {
      setShowQrDialog(true);
    }
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
        {/* Balance Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Boletos disponibles */}
          <Card className="border-primary/30">
            <CardContent className="p-4 text-center">
              <Ticket className="h-8 w-8 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground mb-1">Boletos</p>
              <p className="text-4xl font-bold text-foreground">{ticketCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1">disponibles</p>
            </CardContent>
          </Card>

          {/* QR Digitales activos */}
          <Card
            className={`border-green-500/30 ${activeQrCount > 0 ? "cursor-pointer hover:bg-secondary/50" : ""}`}
            onClick={activeQrCount > 0 ? handleShowQr : undefined}
          >
            <CardContent className="p-4 text-center">
              <QrCode className="h-8 w-8 mx-auto mb-1 text-green-500" />
              <p className="text-xs text-muted-foreground mb-1">QR Digitales</p>
              <p className="text-4xl font-bold text-green-500">{activeQrCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {activeQrCount > 0 ? "toca para ver QR" : "sin QR activos"}
              </p>
            </CardContent>
          </Card>
        </div>

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
            disabled={ticketCount <= 0}
          >
            <QrCode className="h-5 w-5" />
            <span className="text-sm font-semibold">Generar QR</span>
          </Button>
        </div>

        {/* Info */}
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• Compra boletos → aparecen en <strong className="text-foreground">Boletos</strong></p>
            <p>• Genera QR → pasa de Boletos a <strong className="text-foreground">QR Digitales</strong></p>
            <p>• Los boletos <strong className="text-foreground">no expiran</strong></p>
            <p>• QR transferidos vencen en <strong className="text-foreground">24 horas</strong></p>
            <p>• Cada boleto vale <strong className="text-foreground">$9.00 MXN</strong></p>
          </CardContent>
        </Card>

        {/* Historial link */}
        <Button
          variant="ghost"
          className="w-full justify-between text-primary"
          onClick={() => navigate("/wallet/qr-boletos/historial")}
        >
          <span>Ver historial de boletos QR</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* QR Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Tu QR Boleto Digital</DialogTitle>
          </DialogHeader>
          {firstActiveTicket && (
            <div className="text-center space-y-3">
              <p className="text-xs text-muted-foreground">Muestra este código al chofer</p>
              <div className="bg-white p-4 rounded-xl inline-block">
                <QRCodeSVG
                  value={firstActiveTicket.token}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="text-xl font-mono font-bold text-foreground">
                #{firstActiveTicket.token.slice(-6).toUpperCase()}
              </p>
              <p className="text-lg font-semibold text-primary">$9.00 MXN</p>
              <p className="text-xs text-muted-foreground">
                Transporte Urbano - Hermosillo, Sonora
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NavigationBar />
    </div>
  );
}
