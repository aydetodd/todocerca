import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type FilterType = "active" | "used" | "transferred";

interface Movement {
  id: string;
  tipo: string;
  created_at: string;
  detalles: any;
}

export default function HistorialBoletos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>("active");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ active: 0, used: 0, transferred: 0 });
  const [movementsMap, setMovementsMap] = useState<Record<string, Movement[]>>({});

  useEffect(() => {
    if (!user) return;
    fetchCounts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchTickets();
  }, [user, filter]);

  const fetchTransferredTickets = async () => {
    // 1) Currently transferred (pending)
    const { data: pending } = await supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .eq("is_transferred", true);

    // 2) Were transferred and returned (have transfer_returned_at)
    const { data: returned } = await supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .eq("is_transferred", false)
      .not("transfer_returned_at", "is", null);

    // 3) Were transferred and then used
    const { data: usedTransferred } = await supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .eq("status", "used")
      .not("transferred_to", "is", null);

    // Deduplicate by id
    const map = new Map<string, any>();
    [...(pending || []), ...(returned || []), ...(usedTransferred || [])].forEach(t => {
      map.set(t.id, t);
    });
    return Array.from(map.values());
  };

  const fetchCounts = async () => {
    const [activeRes, usedRes, transferredTickets] = await Promise.all([
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
      fetchTransferredTickets(),
    ]);

    // Active count should exclude returned tickets (they show in transferred)
    const returnedCount = transferredTickets.filter(
      (t: any) => t.status === "active" && !t.is_transferred && t.transfer_returned_at
    ).length;

    setCounts({
      active: (activeRes.count ?? 0) - returnedCount,
      used: usedRes.count ?? 0,
      transferred: transferredTickets.length,
    });
  };

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("qr_tickets")
      .select("*")
      .eq("user_id", user!.id)
      .limit(50);

    if (filter === "active") {
      query = query
        .eq("status", "active")
        .eq("is_transferred", false)
        .is("transfer_returned_at", null)
        .order("generated_at", { ascending: false });
    } else if (filter === "used") {
      query = query.eq("status", "used").order("used_at", { ascending: false, nullsFirst: false });
    } else if (filter === "transferred") {
      const transferred = await fetchTransferredTickets();
      if (transferred.length === 0) {
        setTickets([]);
        setMovementsMap({});
        setLoading(false);
        return;
      }
      // Sort: pending first, then by most recent update
      transferred.sort((a, b) => {
        const aIsPending = a.is_transferred ? 0 : 1;
        const bIsPending = b.is_transferred ? 0 : 1;
        if (aIsPending !== bIsPending) return aIsPending - bIsPending;
        return new Date(b.updated_at || b.generated_at).getTime() - new Date(a.updated_at || a.generated_at).getTime();
      });

      // Fetch movements and route info for these tickets
      const ticketIds = transferred.map((t: any) => t.id);
      const { data: movements } = await (supabase
        .from("movimientos_boleto") as any)
        .select("*")
        .in("qr_ticket_id", ticketIds)
        .order("created_at", { ascending: true });

      const map: Record<string, Movement[]> = {};
      (movements || []).forEach((m: any) => {
        if (!map[m.qr_ticket_id]) map[m.qr_ticket_id] = [];
        map[m.qr_ticket_id].push(m);
      });
      setMovementsMap(map);

      // Fetch route names
      const routeProductIds = new Set<string>();
      transferred.forEach((t: any) => {
        if (t.ruta_uso_id) routeProductIds.add(t.ruta_uso_id);
      });
      if (routeProductIds.size > 0) {
        const { data: prods } = await supabase
          .from("productos")
          .select("id, nombre")
          .in("id", Array.from(routeProductIds));
        const routeNameMap: Record<string, string> = {};
        (prods || []).forEach((p: any) => { routeNameMap[p.id] = p.nombre; });
        transferred.forEach((t: any) => {
          t._ruta_nombre = t.ruta_uso_id ? routeNameMap[t.ruta_uso_id] || null : null;
        });
      }

      setTickets(transferred);
      setLoading(false);
      return;
    }

    const { data } = await query;
    if (data) {
      // For used tickets, fetch route name
      if (filter === "used" && data.length > 0) {
        const routeProductIds = new Set<string>();
        data.forEach((t: any) => {
          if (t.ruta_uso_id) routeProductIds.add(t.ruta_uso_id);
        });

        const ticketsWithoutRoute = data.filter((t: any) => !t.ruta_uso_id);
        const ticketRouteMap: Record<string, string> = {};
        if (ticketsWithoutRoute.length > 0) {
          const { data: logs } = await (supabase
            .from("logs_validacion_qr") as any)
            .select("qr_ticket_id, producto_id")
            .in("qr_ticket_id", ticketsWithoutRoute.map((t: any) => t.id))
            .eq("resultado", "valid");
          (logs || []).forEach((l: any) => {
            if (l.producto_id && l.qr_ticket_id) {
              ticketRouteMap[l.qr_ticket_id] = l.producto_id;
              routeProductIds.add(l.producto_id);
            }
          });
        }

        const routeNameMap: Record<string, string> = {};
        if (routeProductIds.size > 0) {
          const { data: prods } = await supabase
            .from("productos")
            .select("id, nombre")
            .in("id", Array.from(routeProductIds));
          (prods || []).forEach((p: any) => {
            routeNameMap[p.id] = p.nombre;
          });
        }

        data.forEach((t: any) => {
          const prodId = t.ruta_uso_id || ticketRouteMap[t.id];
          t._ruta_nombre = prodId ? routeNameMap[prodId] || null : null;
        });
      }

      setTickets(data);
    }
    setLoading(false);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("es-MX", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const getMovementLabel = (tipo: string) => {
    switch (tipo) {
      case "generated": return { icon: "🎫", label: "Generado", color: "text-green-500" };
      case "transferred": return { icon: "📤", label: "Transferido", color: "text-amber-500" };
      case "re_transferred": return { icon: "📤", label: "Re-transferido", color: "text-amber-500" };
      case "transfer_cancelled": return { icon: "↩️", label: "Transferencia cancelada", color: "text-blue-400" };
      case "transfer_expired": return { icon: "🔄", label: "Vencido y devuelto", color: "text-destructive" };
      case "used": return { icon: "✅", label: "Usado", color: "text-green-500" };
      default: return { icon: "•", label: tipo, color: "text-muted-foreground" };
    }
  };

  const filters: { label: string; value: FilterType; count: number }[] = [
    { label: "Activos", value: "active", count: counts.active },
    { label: "Usados", value: "used", count: counts.used },
    { label: "Transferidos", value: "transferred", count: counts.transferred },
  ];

  if (!user) {
    navigate("/auth");
    return null;
  }

  const getTransferStatus = (t: any) => {
    if (t.transfer_returned_at && t.status === "active" && !t.is_transferred) return "devuelto";
    if (t.status === "used") return "usado";
    if (t.status === "active" && t.is_transferred) return "pendiente";
    return "devuelto";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
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
                    <>
                      {(() => {
                        const status = getTransferStatus(t);
                        const movements = movementsMap[t.id] || [];
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="font-mono text-sm font-bold text-foreground">
                                #{t.token.slice(-6).toUpperCase()}
                              </p>
                              {status === "usado" && (
                                <span className="text-xs font-semibold text-destructive">Usado</span>
                              )}
                              {status === "pendiente" && (
                                <span className="text-xs font-semibold text-amber-500">Pendiente</span>
                              )}
                              {status === "devuelto" && (
                                <span className="text-xs font-semibold text-green-500">Disponible</span>
                              )}
                            </div>

                            {/* Full movement timeline */}
                            {movements.length > 0 ? (
                              <div className="mt-2 space-y-1 border-l-2 border-border pl-3 ml-1">
                                {movements.map((m) => {
                                  const { icon, label, color } = getMovementLabel(m.tipo);
                                  return (
                                    <div key={m.id} className="flex items-start gap-2">
                                      <span className="text-xs">{icon}</span>
                                      <div>
                                        <span className={`text-xs font-medium ${color}`}>{label}</span>
                                        <span className="text-xs text-muted-foreground ml-1">
                                          {formatDate(m.created_at)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Fallback for tickets without movement records */
                              <>
                                <p className="text-xs text-green-500">
                                  📤 Transferido: {formatDate(t.generated_at)}
                                </p>
                                {status === "usado" && t.used_at && (
                                  <p className="text-xs text-destructive">
                                    ✅ Usado: {formatDate(t.used_at)}
                                  </p>
                                )}
                                {status === "devuelto" && t.transfer_returned_at && (
                                  <p className="text-xs text-destructive">
                                    🔄 Vencido y devuelto: {formatDate(t.transfer_returned_at)}
                                  </p>
                                )}
                                {status === "pendiente" && t.transfer_expires_at && (
                                  <p className="text-xs text-amber-500">
                                    ⏳ Vence: {formatDate(t.transfer_expires_at)}
                                  </p>
                                )}
                              </>
                            )}

                            {t._ruta_nombre && (
                              <p className="text-xs text-primary font-medium mt-1">
                                🚌 {t._ruta_nombre}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className={`font-mono text-sm font-bold ${
                          filter === "active" ? "text-green-500" : "text-destructive"
                        }`}>
                          #{t.token.slice(-6).toUpperCase()}
                        </p>
                        <span className={`text-xs font-semibold ${
                          filter === "active" ? "text-green-500" : "text-destructive"
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
                      {filter === "used" && t._ruta_nombre && (
                        <p className="text-xs text-primary font-medium">
                          🚌 {t._ruta_nombre}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
