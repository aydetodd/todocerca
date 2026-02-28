import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type FilterType = "active" | "used" | "transferred";

export default function HistorialBoletos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>("active");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ active: 0, used: 0, transferred: 0 });

  useEffect(() => {
    if (!user) return;
    fetchCounts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchTickets();
  }, [user, filter]);

  const fetchCounts = async () => {
    const [activeRes, usedRes, transferredRes] = await Promise.all([
      supabase
        .from("qr_tickets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "active")
        .eq("is_transferred", false),
      supabase
        .from("qr_tickets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "used"),
      supabase
        .from("qr_tickets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_transferred", true),
    ]);
    setCounts({
      active: activeRes.count ?? 0,
      used: usedRes.count ?? 0,
      transferred: transferredRes.count ?? 0,
    });
  };

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .order("generated_at", { ascending: false })
      .limit(50);

    if (filter === "active") {
      query = query.eq("status", "active").eq("is_transferred", false);
    } else if (filter === "used") {
      query = query.eq("status", "used");
    } else if (filter === "transferred") {
      query = query.eq("is_transferred", true);
    }

    const { data } = await query;
    if (data) setTickets(data);
    setLoading(false);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("es-MX", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const filters: { label: string; value: FilterType; count: number }[] = [
    { label: "Activos", value: "active", count: counts.active },
    { label: "Usados", value: "used", count: counts.used },
    { label: "Transferidos", value: "transferred", count: counts.transferred },
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
        {/* Filters with counts */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
              className="shrink-0"
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>

        {/* Tickets List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground animate-pulse">Cargando...</div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No hay boletos en esta categoría
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-1">
                  {filter === "transferred" ? (
                    /* Transferidos: dos renglones */
                    <>
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-sm font-bold text-foreground">
                          #{t.token.slice(-6).toUpperCase()}
                        </p>
                        {t.status === "used" ? (
                          <span className="text-xs font-semibold text-red-500">Usado</span>
                        ) : t.status === "active" ? (
                          <span className="text-xs font-semibold text-amber-500">Pendiente</span>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">Expirado</span>
                        )}
                      </div>
                      <p className="text-xs text-green-500">
                        📤 Transferido: {formatDate(t.generated_at)}
                      </p>
                      {t.used_at ? (
                        <p className="text-xs text-red-500">
                          ✅ Usado: {formatDate(t.used_at)}
                        </p>
                      ) : t.transfer_expires_at ? (
                        <p className="text-xs text-amber-500">
                          ⏳ Vence: {formatDate(t.transfer_expires_at)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    /* Activos y Usados */
                    <>
                      <div className="flex items-center justify-between">
                        <p className={`font-mono text-sm font-bold ${
                          filter === "active" ? "text-green-500" : "text-red-500"
                        }`}>
                          #{t.token.slice(-6).toUpperCase()}
                        </p>
                        <span className={`text-xs font-semibold ${
                          filter === "active" ? "text-green-500" : "text-red-500"
                        }`}>
                          {filter === "active" ? "Activo" : "Usado"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {filter === "active" 
                          ? `Generado: ${formatDate(t.generated_at)}`
                          : `Usado: ${formatDate(t.used_at || t.generated_at)}`
                        }
                      </p>
                    </>
                  )}
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
