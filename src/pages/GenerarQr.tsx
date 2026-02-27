import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Share2, Copy, Download, Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export default function GenerarQr() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [shortCode, setShortCode] = useState("");
  const [ticketCount, setTicketCount] = useState(0);
  const [activeTickets, setActiveTickets] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchBalance();
    fetchActiveTickets();
  }, [user]);

  const fetchBalance = async () => {
    const { data } = await supabase
      .from("cuentas_boletos")
      .select("ticket_count")
      .eq("user_id", user!.id)
      .single();
    if (data) setTicketCount(data.ticket_count);
  };

  const fetchActiveTickets = async () => {
    const { data } = await supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .order("generated_at", { ascending: false });
    if (data) setActiveTickets(data);
  };

  const handleGenerate = async () => {
    if (ticketCount <= 0) {
      toast.error("No tienes boletos disponibles. Compra más boletos.");
      navigate("/wallet/qr-boletos/comprar");
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-qr-ticket");
      if (error) throw error;
      setTicket(data.ticket);
      setShortCode(data.short_code);
      toast.success("QR Boleto generado exitosamente");
      fetchBalance();
      fetchActiveTickets();
    } catch (error: any) {
      toast.error(error.message || "Error al generar QR");
    } finally {
      setGenerating(false);
    }
  };

  const handleTransfer = async (ticketId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("transfer-ticket", {
        body: { ticket_id: ticketId },
      });
      if (error) throw error;

      toast.success("QR marcado para transferir. Válido por 24 horas.");
      
      // Share via Web Share API or WhatsApp
      const shareText = `🚌 QR Boleto Digital - Transporte Urbano Hermosillo\n\nCódigo: ${data.short_code}\nVálido por 24 horas.\n\nMuestra este código al chofer para pagar tu pasaje.`;
      
      if (navigator.share) {
        await navigator.share({
          title: "QR Boleto Digital",
          text: shareText,
        });
      } else {
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(whatsappUrl, "_blank");
      }

      fetchActiveTickets();
    } catch (error: any) {
      toast.error(error.message || "Error al transferir");
    }
  };

  const copyCode = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Código copiado al portapapeles");
  };

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
            <h1 className="text-lg font-bold text-foreground">Generar QR Boleto</h1>
            <p className="text-xs text-muted-foreground">Boletos disponibles: {ticketCount}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Generate Button */}
        <Button
          className="w-full h-14 text-lg"
          size="lg"
          onClick={handleGenerate}
          disabled={generating || ticketCount <= 0}
        >
          {generating ? (
            <span className="animate-pulse">Generando...</span>
          ) : (
            <>
              <QrCode className="h-5 w-5 mr-2" />
              Generar Nuevo QR Boleto
            </>
          )}
        </Button>

        {ticketCount <= 0 && (
          <Card className="border-destructive/50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-destructive mb-2">No tienes boletos disponibles</p>
              <Button size="sm" onClick={() => navigate("/wallet/qr-boletos/comprar")}>
                Comprar Boletos
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Newly Generated Ticket */}
        {ticket && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="p-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">QR Boleto Digital</p>
              <p className="text-xs text-muted-foreground mb-4">Transporte Urbano - Hermosillo, Sonora</p>
              
              <div className="bg-white p-4 rounded-xl inline-block mb-4">
                <QRCodeSVG
                  value={ticket.token}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>

              <p className="text-2xl font-mono font-bold text-foreground mb-1">
                #{shortCode}
              </p>
              <p className="text-lg font-semibold text-primary mb-4">$9.00 MXN</p>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => copyCode(ticket.token)}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar
                </Button>
                <Button variant="outline" onClick={() => handleTransfer(ticket.id)}>
                  <Send className="h-4 w-4 mr-1" /> Transferir
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Tickets List */}
        {activeTickets.length > 0 && (
          <>
            <h2 className="font-semibold text-foreground mt-6">Boletos activos</h2>
            <div className="space-y-2">
              {activeTickets.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-1 rounded">
                        <QRCodeSVG value={t.token} size={40} />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold text-foreground">
                          #{t.token.slice(-6).toUpperCase()}
                        </p>
                        <div className="flex items-center gap-1">
                          {t.is_transferred ? (
                            <div className="flex items-center gap-1 text-xs text-amber-500">
                              <Clock className="h-3 w-3" />
                              <span>
                                Vence {new Date(t.transfer_expires_at).toLocaleString("es-MX", {
                                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-green-500">Disponible</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!t.is_transferred && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTransfer(t.id)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Info */}
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>• Cada QR es de <strong className="text-foreground">un solo uso</strong></p>
            <p>• Si transfieres un QR, vence en <strong className="text-foreground">24 horas</strong></p>
            <p>• Si no se usa, el boleto <strong className="text-foreground">regresa a tu cuenta</strong></p>
            <p>• Máximo 20 QR por día</p>
          </CardContent>
        </Card>
      </div>

      <NavigationBar />
    </div>
  );
}
