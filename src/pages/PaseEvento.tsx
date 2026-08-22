import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface PasePublico {
  codigo: string;
  nombre_invitado: string | null;
  personas: number;
  estado: string;
  evento_nombre: string;
  evento_inicia: string | null;
  evento_fondo: string | null;
  lugar_nombre: string | null;
  lugar_direccion: string | null;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", {
        timeZone: "America/Hermosillo",
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function PaseEvento() {
  const { codigo } = useParams();
  const [pase, setPase] = useState<PasePublico | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!codigo) return;
      const { data } = await supabase.rpc("ev_get_pase_publico", { _codigo: codigo });
      const row = Array.isArray(data) ? data[0] : data;
      setPase((row as PasePublico) || null);
      setLoading(false);
    };
    run();
  }, [codigo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!pase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Este pase no existe o fue cancelado.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm overflow-hidden">
        {pase.evento_fondo && (
          <img src={pase.evento_fondo} alt={`Invitación a ${pase.evento_nombre}`} className="w-full object-cover" />
        )}
        <CardContent className="p-6 space-y-4 text-center">
          <div>
            <h1 className="text-xl font-semibold">{pase.evento_nombre}</h1>
            <p className="text-sm text-muted-foreground capitalize">{fmt(pase.evento_inicia)}</p>
            {pase.lugar_nombre && (
              <p className="text-sm text-muted-foreground">
                {pase.lugar_nombre}
                {pase.lugar_direccion ? ` · ${pase.lugar_direccion}` : ""}
              </p>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl inline-block">
            <QRCodeSVG value={pase.codigo} size={220} />
          </div>

          <div>
            <p className="font-medium">{pase.nombre_invitado}</p>
            <p className="text-sm text-muted-foreground">
              Válido para {pase.personas} {pase.personas === 1 ? "persona" : "personas"}
            </p>
            <p className="text-xs font-mono mt-1">{pase.codigo}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            {pase.estado === "valid"
              ? "Muestra este código en la entrada."
              : pase.estado === "used"
              ? "Este pase ya fue usado."
              : "Pase cancelado."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
