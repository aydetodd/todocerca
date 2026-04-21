import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, Clock, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type TicketCategory, getDiscountCategories } from "@/lib/ticketCategories";

type VerificacionDescuento = {
  id: string;
  tipo: string;
  estado: string;
  url_credencial: string;
  device_id: string | null;
  admin_notas: string | null;
  created_at: string;
};

function getDeviceId(): string {
  const stored = localStorage.getItem("tc_device_id");
  if (stored) return stored;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx?.fillText("device-fp", 10, 10);

  const nav = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < nav.length; i++) {
    const chr = nav.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }

  const deviceId = `dev_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
  localStorage.setItem("tc_device_id", deviceId);
  return deviceId;
}

export default function SolicitudDescuento() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [verificaciones, setVerificaciones] = useState<VerificacionDescuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<TicketCategory | null>(null);

  const discountCategories = getDiscountCategories();

  useEffect(() => {
    if (user) fetchVerificaciones();
  }, [user]);

  const fetchVerificaciones = async () => {
    const { data, error } = await (supabase
      .from("verificaciones_descuento") as any)
      .select("*")
      .eq("user_id", user!.id);

    if (!error && data) setVerificaciones(data);
    setLoading(false);
  };

  const getExistingVerification = (tipo: string) =>
    verificaciones.find((v) => v.tipo === tipo);

  const handleUpload = async (file: File) => {
    if (!user || !selectedType) return;

    const existing = getExistingVerification(selectedType);
    if (existing && !["rechazado", "incompleto"].includes(existing.estado)) {
      toast.error("Ya tienes una solicitud para este tipo de descuento");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `descuentos/${user.id}/${selectedType}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("credenciales")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("credenciales")
        .getPublicUrl(filePath);

      const deviceId = getDeviceId();

      if (existing?.estado === "rechazado" || existing?.estado === "incompleto") {
        const { error } = await (supabase
          .from("verificaciones_descuento") as any)
          .update({
            url_credencial: urlData.publicUrl,
            device_id: deviceId,
            estado: "pendiente",
            admin_notas: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase
          .from("verificaciones_descuento") as any)
          .insert({
            user_id: user.id,
            tipo: selectedType,
            url_credencial: urlData.publicUrl,
            device_id: deviceId,
          });

        if (error) throw error;
      }

      toast.success("Solicitud enviada. Un administrador la revisará pronto.");
      setSelectedType(null);
      fetchVerificaciones();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al enviar solicitud");
    } finally {
      setUploading(false);
    }
  };

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case "aprobado":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Aprobado</Badge>;
      case "rechazado":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rechazado</Badge>;
      case "incompleto":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" /> Incompleto</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> En revisión</Badge>;
    }
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold text-foreground">Descuento Social</h1>
            <p className="text-xs text-muted-foreground">Tarifas preferenciales para transporte</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Info card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> ¿Cómo funciona?
            </p>
            <p>• Sube tu credencial o documento comprobatorio</p>
            <p>• Un administrador revisará tu solicitud</p>
            <p>• Si es aprobada, comprarás boletos al precio preferencial</p>
            <p>• Los boletos con descuento <strong>no se pueden transferir</strong></p>
            <p>• Solo podrás usarlos desde este dispositivo</p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {discountCategories.map((cat) => {
              const existing = getExistingVerification(cat.key);
              const isApproved = existing?.estado === "aprobado";
              const canRetry = !existing || existing.estado === "rechazado" || existing.estado === "incompleto";

              return (
                <Card
                  key={cat.key}
                  className={`transition-all ${isApproved ? "border-green-500/50 bg-green-500/5" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cat.icon}</span>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{cat.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {cat.esGratis ? "Gratis" : `$${cat.precio.toFixed(2)} MXN`}
                            {" · "}
                            {cat.descripcionCredencial}
                          </p>
                        </div>
                      </div>
                      {existing && estadoBadge(existing.estado)}
                    </div>

                    {(existing?.estado === "rechazado" || existing?.estado === "incompleto") && existing.admin_notas && (
                      <p className="text-xs text-destructive mb-2">
                        Motivo: {existing.admin_notas}
                      </p>
                    )}

                    {canRetry && (
                      <>
                        {selectedType === cat.key ? (
                          <div className="space-y-2">
                            <label className="block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUpload(f);
                                }}
                                disabled={uploading}
                              />
                              <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:border-primary/60 transition-colors">
                                {uploading ? (
                                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                ) : (
                                  <>
                                    <Upload className="h-5 w-5 text-primary" />
                                    <span className="text-sm text-primary font-medium">Tomar foto o seleccionar documento</span>
                                  </>
                                )}
                              </div>
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full"
                              onClick={() => setSelectedType(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => setSelectedType(cat.key)}
                          >
                            {existing?.estado === "rechazado" ? "Reintentar solicitud" : "Solicitar descuento"}
                          </Button>
                        )}
                      </>
                    )}

                    {isApproved && (
                      <p className="text-xs text-green-500 mt-1">
                        ✅ Descuento activo. Precio: {cat.esGratis ? "Gratis" : `$${cat.precio.toFixed(2)} MXN`} por boleto.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
