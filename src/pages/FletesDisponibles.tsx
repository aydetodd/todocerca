import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Trash2, Truck, Package } from "lucide-react";
import type { FleteAnuncio } from "@/lib/fletes";

export default function FletesDisponibles({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [lista, setLista] = useState<FleteAnuncio[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = async () => {
    if (!user) return;
    const { data } = await supabase.from("fletes_anuncios" as any).select("*").eq("user_id", user.id).order("tipo").order("titulo");
    setLista((data as any) ?? []);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    cargar();
    const ch = supabase.channel(`mis-fletes-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fletes_anuncios", filter: `user_id=eq.${user.id}` }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const cambiar = async (a: FleteAnuncio, v: boolean) => {
    setGuardando(a.id);
    setLista((l) => l.map((x) => (x.id === a.id ? { ...x, disponible: v } : x)));
    const { error } = await supabase.from("fletes_anuncios" as any).update({ disponible: v }).eq("id", a.id);
    setGuardando(null);
    if (error) { toast({ title: "No se guardó", description: error.message, variant: "destructive" }); cargar(); }
  };

  const borrar = async (a: FleteAnuncio) => {
    if (!confirm(`¿Borrar "${a.titulo}"?`)) return;
    const { error } = await supabase.from("fletes_anuncios" as any).delete().eq("id", a.id);
    if (error) toast({ title: "No se borró", description: error.message, variant: "destructive" });
    else cargar();
  };

  const grupos: [string, FleteAnuncio[]][] = [
    ["Mis unidades por ciudad", lista.filter((a) => a.tipo === "transportista")],
    ["Mis cargas", lista.filter((a) => a.tipo === "remitente")],
  ];

  return (
    <div className={embedded ? "space-y-4" : "min-h-screen bg-background p-4 pb-40 max-w-2xl mx-auto space-y-4"}>
      <div className="flex items-center gap-2">
        {!embedded && <Button variant="ghost" size="icon" onClick={() => navigate("/fletes")}><ArrowLeft className="h-5 w-5" /></Button>}
        <h1 className="text-xl font-bold">Mis Disponibles</h1>
      </div>
      <p className="text-sm text-muted-foreground">Encendido = se ve en Fletes. Apagado = nadie lo ve. Si no lo cambias en 30 días, se apaga solo.</p>
      {lista.length === 0 && (
        <Card><CardContent className="p-4 text-sm">Aún no tienes anuncios. <Button variant="link" className="px-1" onClick={() => navigate("/fletes")}>Publicar en Fletes</Button></CardContent></Card>
      )}
      {grupos.map(([titulo, items]) => items.length > 0 && (
        <div key={titulo} className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2">{titulo.includes("unidades") ? <Truck className="h-4 w-4" /> : <Package className="h-4 w-4" />}{titulo}</h2>
          {items.map((a) => (
            <Card key={a.id} className={a.disponible ? "" : "opacity-60"}>
              <CardContent className="p-4 flex items-center gap-3">
                <Switch checked={a.disponible} disabled={guardando === a.id} onCheckedChange={(v) => cambiar(a, v)} className="scale-125" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.disponible ? "Visible" : "Oculto"}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => borrar(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
