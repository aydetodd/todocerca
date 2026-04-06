import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, UserRound, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

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

    // Fetch user info for each
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
    try {
      const { error } = await (supabase
        .from("verificaciones_descuento") as any)
        .update({
          estado: action,
          admin_notas: notas[id] || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success(
        action === "aprobado" ? "Descuento aprobado" : 
        action === "incompleto" ? "Marcado como incompleto" : "Solicitud rechazada"
      );
      fetchSolicitudes();
    } catch (err: any) {
      toast.error(err.message);
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

      {pendientes.map((s) => (
        <Card key={s.id} className="border-yellow-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {s.tipo === "estudiante" ? (
                  <GraduationCap className="h-5 w-5 text-blue-500" />
                ) : (
                  <UserRound className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium text-foreground capitalize">{s.tipo.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">{s.user_email} · {s.user_phone}</p>
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
      ))}

      {procesadas.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground mt-6">Historial</h3>
          {procesadas.map((s) => (
            <Card key={s.id} className="opacity-70">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {s.tipo === "estudiante" ? (
                    <GraduationCap className="h-4 w-4 text-blue-500" />
                  ) : (
                    <UserRound className="h-4 w-4 text-amber-500" />
                  )}
                  <div>
                    <p className="text-sm">{s.user_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge className={s.estado === "aprobado" ? "bg-green-500/20 text-green-400" : ""} variant={s.estado === "rechazado" ? "destructive" : "default"}>
                  {s.estado}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
