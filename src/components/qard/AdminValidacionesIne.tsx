import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

type Validacion = {
  id: string;
  user_id: string;
  ine_nombre_extraido: string | null;
  ine_curp_extraido: string | null;
  ine_numero_credencial: string | null;
  ine_fecha_nacimiento: string | null;
  curp_renapo: string | null;
  nombre_renapo: string | null;
  coincidencia: boolean;
  ine_confirmed: boolean;
  estado: string;
  created_at: string;
};

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de confirmación", clase: "bg-amber-500 text-white" },
  confirmado: { texto: "Confirmado", clase: "bg-emerald-500 text-white" },
  rechazado: { texto: "Rechazado", clase: "bg-destructive text-destructive-foreground" },
  no_coincide: { texto: "CURP distinta", clase: "bg-destructive text-destructive-foreground" },
};

const FILTROS = ["todas", "pendiente", "confirmado", "rechazado", "no_coincide"] as const;

export default function AdminValidacionesIne() {
  const [filas, setFilas] = useState<Validacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("todas");

  const cargar = async () => {
    setCargando(true);
    const { data } = await (supabase as any)
      .from("ine_validaciones")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setFilas((data ?? []) as Validacion[]);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const visibles = filtro === "todas" ? filas : filas.filter(f => f.estado === filtro);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          Validaciones de INE
          <Button variant="ghost" size="icon" onClick={cargar} aria-label="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map(f => (
            <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
              {f === "todas" ? "Todas" : ESTADOS[f]?.texto ?? f}
            </Button>
          ))}
        </div>

        {cargando ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay validaciones en esta lista.</p>
        ) : (
          visibles.map(v => (
            <div key={v.id} className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleString("es-MX")}
                </span>
                <Badge className={ESTADOS[v.estado]?.clase}>{ESTADOS[v.estado]?.texto ?? v.estado}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Leído de la INE</div>
                  <div className="font-medium break-words">{v.ine_nombre_extraido || "—"}</div>
                  <div className="font-mono text-xs break-all">{v.ine_curp_extraido || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Validado con RENAPO</div>
                  <div className="font-medium break-words">{v.nombre_renapo || "—"}</div>
                  <div className="font-mono text-xs break-all">{v.curp_renapo || "—"}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Credencial: {v.ine_numero_credencial || "—"} · Nacimiento: {v.ine_fecha_nacimiento || "—"} ·{" "}
                {v.coincidencia ? "CURP coincide" : "CURP no coincide"}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
