import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Building2, Check, FileText, Loader2, X } from "lucide-react";

type Solicitud = {
  id: string;
  user_id: string;
  razon_social: string;
  rfc: string;
  tipo_persona?: string;
  constancia_path: string;
  estado: string;
  created_at: string;
};

export default function AdminSolicitudesMoral() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("qard_moral_solicitudes" as any)
      .select("*")
      .eq("estado", "pending")
      .order("created_at", { ascending: true });
    setSolicitudes((data as any) ?? []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const verConstancia = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("constancias-fiscales")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "No se pudo abrir el documento", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const resolver = async (id: string, aprobar: boolean) => {
    setOcupado(id);
    try {
      const { data, error } = await supabase.functions.invoke("qard-moral", {
        body: { accion: "resolver", solicitud_id: id, aprobar, motivo: motivos[id] ?? "" },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: aprobar ? "Solicitud aprobada" : "Solicitud rechazada" });
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo resolver", description: e.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" />
          Solicitudes de Comerciante
          <Badge variant="secondary">{solicitudes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!cargando && solicitudes.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
        )}
        {solicitudes.map(s => (
          <div key={s.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{s.razon_social}</p>
                <p className="text-xs text-muted-foreground">
                  {s.tipo_persona === "fisica" ? "Persona Física" : "Persona Moral"}
                </p>
                <p className="text-xs font-mono text-muted-foreground">{s.rfc || "CURP resguardada"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString("es-MX")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => verConstancia(s.constancia_path)}>
                <FileText className="h-4 w-4 mr-1" /> Ver constancia
              </Button>
            </div>
            <Input
              placeholder="Motivo (solo si vas a rechazar)"
              value={motivos[s.id] ?? ""}
              onChange={e => setMotivos(m => ({ ...m, [s.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={ocupado === s.id} onClick={() => resolver(s.id, true)}>
                {ocupado === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Check className="h-4 w-4 mr-1" /> Aprobar</>)}
              </Button>
              <Button size="sm" variant="destructive" className="flex-1"
                disabled={ocupado === s.id || (motivos[s.id] ?? "").trim().length < 5}
                onClick={() => resolver(s.id, false)}>
                <X className="h-4 w-4 mr-1" /> Rechazar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
