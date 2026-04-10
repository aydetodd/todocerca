import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageCircle, Send, Bus, Users, MapPin, Clock, FileText,
  ChevronDown, ChevronUp, Eye,
} from "lucide-react";

type Nota = {
  id: string;
  contrato_id: string;
  autor_id: string;
  autor_tipo: string;
  tipo_nota: string;
  contenido: string;
  leido_contraparte: boolean;
  created_at: string;
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  unidades: <Bus className="h-3.5 w-3.5" />,
  choferes: <Users className="h-3.5 w-3.5" />,
  rutas: <MapPin className="h-3.5 w-3.5" />,
  horarios: <Clock className="h-3.5 w-3.5" />,
  general: <FileText className="h-3.5 w-3.5" />,
};

const TIPO_LABELS: Record<string, string> = {
  unidades: "Unidades",
  choferes: "Choferes",
  rutas: "Rutas",
  horarios: "Horarios",
  general: "General",
};

interface ContratoNotasProps {
  contratoId: string;
  autorTipo: "concesionario" | "empresa";
  userId: string;
}

export default function ContratoNotas({ contratoId, autorTipo, userId }: ContratoNotasProps) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [contenido, setContenido] = useState("");
  const [tipoNota, setTipoNota] = useState("general");
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotas = async () => {
    const { data } = await supabase
      .from("notas_contrato")
      .select("*")
      .eq("contrato_id", contratoId)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = (data || []) as Nota[];
    setNotas(items);
    setUnreadCount(items.filter(n => n.autor_tipo !== autorTipo && !n.leido_contraparte).length);
  };

  useEffect(() => {
    if (expanded) {
      loadNotas();
      // Mark unread as read
      supabase
        .from("notas_contrato")
        .update({ leido_contraparte: true })
        .eq("contrato_id", contratoId)
        .neq("autor_tipo", autorTipo)
        .eq("leido_contraparte", false)
        .then(() => setUnreadCount(0));
    }
  }, [expanded, contratoId]);

  useEffect(() => {
    if (!expanded) {
      // Just count unread
      supabase
        .from("notas_contrato")
        .select("id", { count: "exact", head: true })
        .eq("contrato_id", contratoId)
        .neq("autor_tipo", autorTipo)
        .eq("leido_contraparte", false)
        .then(({ count }) => setUnreadCount(count || 0));
    }
  }, [contratoId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`notas-contrato-${contratoId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notas_contrato",
        filter: `contrato_id=eq.${contratoId}`,
      }, (payload) => {
        const newNota = payload.new as Nota;
        setNotas(prev => [newNota, ...prev]);
        if (newNota.autor_tipo !== autorTipo) {
          if (expanded) {
            // Auto-mark as read
            supabase
              .from("notas_contrato")
              .update({ leido_contraparte: true })
              .eq("id", newNota.id);
          } else {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contratoId, autorTipo, expanded]);

  const handleSend = async () => {
    if (!contenido.trim()) return;
    setSending(true);
    await supabase.from("notas_contrato").insert({
      contrato_id: contratoId,
      autor_id: userId,
      autor_tipo: autorTipo,
      tipo_nota: tipoNota,
      contenido: contenido.trim(),
    });
    setSending(false);
    setContenido("");
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) +
      " " + date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Novedades del contrato
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-4">
            {unreadCount}
          </Badge>
        )}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Input para nueva nota */}
          <div className="flex gap-1.5 items-end">
            <Select value={tipoNota} onValueChange={setTipoNota}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    <span className="flex items-center gap-1">{TIPO_ICONS[k]} {v}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              placeholder="Escribir novedad..."
              className="h-8 text-xs flex-1"
              onKeyDown={e => e.key === "Enter" && !sending && handleSend()}
            />
            <Button size="sm" className="h-8 px-2" onClick={handleSend} disabled={sending || !contenido.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Lista de notas */}
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {notas.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Sin novedades aún</p>
            )}
            {notas.map(n => (
              <div
                key={n.id}
                className={`rounded-md p-2 text-xs ${
                  n.autor_tipo === autorTipo
                    ? "bg-primary/10 ml-4"
                    : "bg-muted/50 mr-4"
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  {TIPO_ICONS[n.tipo_nota]}
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {TIPO_LABELS[n.tipo_nota]}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-[10px]">
                    {n.autor_tipo === autorTipo ? "Tú" : n.autor_tipo === "concesionario" ? "Concesionario" : "Empresa"}
                    {" · "}{formatDate(n.created_at)}
                  </span>
                  {n.leido_contraparte && n.autor_tipo === autorTipo && (
                    <Eye className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <p>{n.contenido}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
