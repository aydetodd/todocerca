import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { History, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type FilterType = "todos" | "active" | "used" | "expired";

export default function HistorialBoletos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>("todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchTickets();
  }, [user, filter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .order("generated_at", { ascending: false })
      .limit(50);

    if (filter !== "todos") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    if (data) setTickets(data);
    setLoading(false);
  };

  const statusBadge = (t: any) => {
    if (t.status === "used") return <Badge variant="secondary">Usado</Badge>;
    if (t.status === "expired") return <Badge variant="outline">Expirado</Badge>;
    if (t.status === "cancelled") return <Badge variant="destructive">Cancelado</Badge>;
    if (t.is_transferred) return <Badge className="bg-amber-600">Transferido</Badge>;
    return <Badge className="bg-green-600">Activo</Badge>;
  };

  const filters: { label: string; value: FilterType }[] = [
    { label: "Todos", value: "todos" },
    { label: "Activos", value: "active" },
    { label: "Usados", value: "used" },
    { label: "Expirados", value: "expired" },
  ];

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
            <h1 className="text-lg font-bold text-foreground">Historial de Boletos</h1>
            <p className="text-xs text-muted-foreground">QR Boleto Digital - Hermosillo</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
              className="shrink-0"
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Tickets List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground animate-pulse">Cargando...</div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No se encontraron boletos con este filtro
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono text-sm font-bold text-foreground">
                      #{t.token.slice(-6).toUpperCase()}
                    </p>
                    {statusBadge(t)}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Generado:{" "}
                      {new Date(t.generated_at).toLocaleString("es-MX", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    {t.used_at && (
                      <p>
                        Usado:{" "}
                        {new Date(t.used_at).toLocaleString("es-MX", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                    {t.is_transferred && t.transfer_expires_at && (
                      <p className="text-amber-500">
                        Vence:{" "}
                        {new Date(t.transfer_expires_at).toLocaleString("es-MX", {
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
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
