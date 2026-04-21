import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, ExternalLink, Clock } from "lucide-react";
import { getCategoryConfig, getCategoryLabel, getCategoryPrice } from "@/lib/ticketCategories";

type SolicitudDescuento = {
  id: string;
  user_id: string;
  tipo: string;
  estado: string;
  url_credencial: string;
  device_id: string | null;
  admin_notas: string | null;
  created_at: string;
  user_email?: string;
  user_phone?: string;
};

export default function AdminDescuentos() {
  const [solicitudes, setSolicitudes] = useState<SolicitudDescuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    const { data, error } = await (supabase
      .from("verificaciones_descuento") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error al cargar solicitudes");
      setLoading(false);
      return;
    }

    const enriched = await Promise.all(
      (data || []).map(async (s: any) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, phone")
          .eq("user_id", s.user_id)
          .single();
        return {
          ...s,
          user_email: profile?.email || "—",
          user_phone: profile?.phone || "—",
        };
      })
    );

    setSolicitudes(enriched);
    setLoading(false);
  };

  const handleAction = async (id: string, action: "aprobado" | "rechazado" | "incompleto") => {
    setProcessing(id);
    const solicitud = solicitudes.find((s) => s.id === id);
    try {
      const now = new Date();
      const { data: updated, error } = await (supabase
        .from("verificaciones_descuento") as any)
        .update({
          estado: action,
          admin_notas: notas[id] || null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      if (!updated) throw new Error("No se pudo actualizar, verifica permisos");

      if (solicitud) {
        const catConfig = getCategoryConfig(solicitud.tipo);
        const tipoLabel = catConfig?.label || solicitud.tipo;
        const precio = getCategoryPrice(solicitud.tipo);
        const precioText = precio === 0 ? "Gratis" : `$${precio.toFixed(2)} MXN`;

        const fechaHora = now.toLocaleString("es-MX", {
          dateStyle: "long",
          timeStyle: "short",
        });

        let mensaje = "";
        if (action === "aprobado") {
          mensaje = `✅ ¡Tu solicitud de Descuento Social (${tipoLabel}) ha sido APROBADA!\n\n📅 Fecha: ${fechaHora}\n\nA partir de ahora tus boletos costarán ${precioText} en vez de $9.00. Recuerda que los boletos con descuento no son transferibles y solo se pueden usar desde tu dispositivo registrado.`;
        } else if (action === "rechazado") {
          mensaje = `❌ Tu solicitud de Descuento Social (${tipoLabel}) ha sido RECHAZADA.\n\n📅 Fecha: ${fechaHora}${notas[id] ? `\n📝 Motivo: ${notas[id]}` : ""}\n\nPuedes volver a enviar tu solicitud con la documentación correcta desde la sección de Descuento Social.`;
        } else {
          mensaje = `⚠️ Tu solicitud de Descuento Social (${tipoLabel}) está marcada como INCOMPLETA.\n\n📅 Fecha: ${fechaHora}${notas[id] ? `\n📝 Observación: ${notas[id]}` : ""}\n\nPor favor sube nuevamente tu credencial con la información completa y legible.`;
        }

        await supabase.from("messages").insert({
          sender_id: "00000000-0000-0000-0000-000000000001",
          receiver_id: solicitud.user_id,
          message: mensaje,
          is_panic: false,
          is_read: false,
        });
      }

      toast.success(
        action === "aprobado"
          ? "Descuento aprobado ✅"
          : action === "incompleto"
          ? "Marcado como incompleto ⚠️"
          : "Solicitud rechazada ❌"
      );
      fetchSolicitudes();
    } catch (err: any) {
      console.error("Error al procesar solicitud:", err);
      toast.error(err.message || "Error al procesar solicitud");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const procesadas = solicitudes.filter((s) => s.estado !== "pendiente");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">
        Solicitudes de Descuento Social ({pendientes.length} pendientes)
      </h2>

      {pendientes.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      )}

      {pendientes.map((s) => {
        const catConfig = getCategoryConfig(s.tipo);
        return (
          <Card key={s.id} className="border-yellow-500/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{catConfig?.icon || "🎫"}</span>
                  <div>
                    <p className="font-medium text-foreground">{catConfig?.label || s.tipo}</p>
                    <p className="text-xs text-muted-foreground">{s.user_email} · {s.user_phone}</p>
                    <p className="text-xs text-primary">
                      Precio: {catConfig?.esGratis ? "Gratis" : `$${(catConfig?.precio || 9).toFixed(2)} MXN`}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Pendiente</Badge>
              </div>

              <a
                href={s.url_credencial}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Ver credencial
              </a>

              <p className="text-xs text-muted-foreground">
                Device ID: {s.device_id || "No registrado"}
              </p>

              <Textarea
                placeholder="Notas del admin (opcional, motivo de rechazo)"
                value={notas[s.id] || ""}
                onChange={(e) => setNotas({ ...notas, [s.id]: e.target.value })}
                className="text-sm"
                rows={2}
              />

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleAction(s.id, "aprobado")}
                  disabled={processing === s.id}
                >
                  {processing === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Aprobar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                  onClick={() => handleAction(s.id, "incompleto")}
                  disabled={processing === s.id}
                >
                  <Clock className="h-4 w-4 mr-1" /> Incompleto
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleAction(s.id, "rechazado")}
                  disabled={processing === s.id}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Rechazar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {procesadas.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground mt-6">Historial</h3>
          {procesadas.map((s) => {
            const catConfig = getCategoryConfig(s.tipo);
            return (
              <Card key={s.id} className="opacity-70">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{catConfig?.icon || "🎫"}</span>
                    <div>
                      <p className="text-sm">{catConfig?.label || s.tipo} · {s.user_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      s.estado === "aprobado"
                        ? "bg-green-500/20 text-green-400"
                        : s.estado === "incompleto"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : ""
                    }
                    variant={s.estado === "rechazado" ? "destructive" : "default"}
                  >
                    {s.estado}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
