import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, QrCode, ArrowRight, Send, Share2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useContacts } from "@/hooks/useContacts";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function QrBoletos() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeQrCount, setActiveQrCount] = useState(0);
  const [firstActiveTicket, setFirstActiveTicket] = useState<any>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showTransferOptions, setShowTransferOptions] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [sendingInternal, setSendingInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const { conversations } = useUnreadMessages();
  const { contacts } = useContacts();

  useEffect(() => {
    const purchase = searchParams.get("purchase");
    const qty = searchParams.get("qty");
    if (purchase === "success" && qty) {
      toast.success(`¡Compra exitosa! Se generarán ${qty} códigos QR automáticamente.`);
    } else if (purchase === "cancelled") {
      toast.info("Compra cancelada");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetchActiveQrs();
  }, [user]);

  const fetchActiveQrs = async () => {
    const { data } = await supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .eq("is_transferred", false)
      .order("generated_at", { ascending: true });

    if (data) {
      setActiveQrCount(data.length);
      setFirstActiveTicket(data.length > 0 ? data[0] : null);
    }
    setLoading(false);
  };

  const handleShowQr = () => {
    if (firstActiveTicket) {
      setShowQrDialog(true);
    }
  };

  const generateQrImage = (token: string, shortCode: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      canvas.width = 600;
      canvas.height = 820;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.roundRect(0, 0, 600, 820, 20);
      ctx.fill();

      // Header bar
      ctx.fillStyle = '#1e40af';
      ctx.roundRect(0, 0, 600, 80, [20, 20, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚌 QR Boleto Digital', 300, 50);

      // Subtitle
      ctx.fillStyle = '#6b7280';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText('Transporte Urbano - Hermosillo, Sonora', 300, 115);

      // Render QR from existing SVG
      const svgEl = document.getElementById('qr-code-svg');
      if (!svgEl) return reject(new Error('QR SVG not found'));
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const img = new Image();
      img.onload = () => {
        // QR white background
        ctx.fillStyle = '#f9fafb';
        ctx.roundRect(100, 135, 400, 400, 16);
        ctx.fill();
        ctx.drawImage(img, 120, 155, 360, 360);

        // Short code
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 40px monospace';
        ctx.fillText(`#${shortCode}`, 300, 580);

        // Price
        ctx.fillStyle = '#2563eb';
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.fillText('$9.00 MXN', 300, 625);

        // Validity
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('⏰ Válido por 24 horas', 300, 665);

        // Instructions
        ctx.fillStyle = '#374151';
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('Muestra este QR al chofer para pagar tu pasaje', 300, 710);

        // UUID small
        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px monospace';
        ctx.fillText(token, 300, 750);

        // Footer
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(40, 770, 520, 1);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText('TodoCerca - todocerca.mx', 300, 800);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate image'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    });
  };

  const handleTransfer = async () => {
    if (!firstActiveTicket) return;
    try {
      const shortCode = firstActiveTicket.token.slice(-6).toUpperCase();
      
      // Generate QR image BEFORE marking as transferred (while SVG is still visible)
      let qrBlob: Blob | null = null;
      try {
        qrBlob = await generateQrImage(firstActiveTicket.token, shortCode);
      } catch (e) {
        console.warn('Could not generate QR image:', e);
      }

      const { data, error } = await supabase.functions.invoke("transfer-ticket", {
        body: { ticket_id: firstActiveTicket.id },
      });
      if (error) throw error;

      setShowQrDialog(false);

      const shareText = `🚌 QR Boleto Digital - Transporte Urbano Hermosillo\n\nCódigo: ${data.short_code}\nToken: ${firstActiveTicket.token}\nVálido por 24 horas.\n\nMuestra este QR al chofer para pagar tu pasaje.`;

      let shared = false;
      try {
        if (navigator.share && qrBlob) {
          const file = new File([qrBlob], `qr-boleto-${shortCode}.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title: "QR Boleto Digital", text: shareText, files: [file] });
            shared = true;
          } else {
            await navigator.share({ title: "QR Boleto Digital", text: shareText });
            shared = true;
          }
        } else if (navigator.share) {
          await navigator.share({ title: "QR Boleto Digital", text: shareText });
          shared = true;
        } else {
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
          window.open(whatsappUrl, "_blank");
          shared = true;
        }
      } catch {
        // Share was cancelled or failed
      }

      if (!shared) {
        await supabase.functions.invoke("cancel-transfer", {
          body: { ticket_id: firstActiveTicket.id },
        });
        toast.info("Transferencia cancelada");
      } else {
        toast.success("QR transferido. Válido por 24 horas.");
      }

      fetchActiveQrs();
    } catch (error: any) {
      toast.error(error.message || "Error al transferir");
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
        {/* QR Digitales Card */}
        <Card
          className={`border-green-500/30 ${activeQrCount > 0 ? "cursor-pointer hover:bg-secondary/50" : ""}`}
          onClick={activeQrCount > 0 ? handleShowQr : undefined}
        >
          <CardContent className="p-6 text-center">
            <QrCode className="h-10 w-10 mx-auto mb-2 text-green-500" />
            <p className="text-sm text-muted-foreground mb-1">QR Digitales Disponibles</p>
            <p className="text-5xl font-bold text-green-500">{activeQrCount}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {activeQrCount > 0 ? "Toca para ver tu QR" : "Sin QR disponibles"}
            </p>
          </CardContent>
        </Card>

        {/* Comprar Button */}
        <Button
          size="lg"
          className="w-full h-14 text-lg"
          onClick={() => navigate("/wallet/qr-boletos/comprar")}
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          Comprar Códigos QR
        </Button>

        {/* Info */}
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• Compra códigos QR → se generan <strong className="text-foreground">automáticamente</strong></p>
            <p>• Cada código QR vale <strong className="text-foreground">$9.00 MXN</strong></p>
            <p>• Los QR <strong className="text-foreground">no expiran</strong> hasta que se usen</p>
            <p>• QR transferidos vencen en <strong className="text-foreground">24 horas</strong></p>
            <p>• Muestra el QR al chofer para pagar tu pasaje</p>
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
                  id="qr-code-svg"
                  value={firstActiveTicket.token}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="text-xl font-mono font-bold text-foreground">
                #{firstActiveTicket.token.slice(-6).toUpperCase()}
              </p>
              <button
                className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(firstActiveTicket.token);
                  toast.success('UUID copiado al portapapeles');
                }}
              >
                📋 {firstActiveTicket.token}
              </button>
              <p className="text-lg font-semibold text-primary">$9.00 MXN</p>
              <p className="text-xs text-muted-foreground">
                Transporte Urbano - Hermosillo, Sonora
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={handleTransfer}
              >
                <Send className="h-4 w-4 mr-2" /> Transferir QR
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      
    </div>
  );
}
