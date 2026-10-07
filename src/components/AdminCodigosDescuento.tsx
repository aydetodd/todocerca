// Gestión de códigos de descuento del 100% para la Suscripción Anual de Proveedor.
// Solo el administrador (consecutive_number = 1) puede crear y ver códigos.
// Los códigos se canjean desde ProveedorTipoSelector ("Activar sin pago").
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ticket, Dices } from "lucide-react";
import { formatHermosillo } from "@/lib/utils";

type Codigo = {
  id: string;
  codigo: string;
  usado: boolean;
  creado_en: string;
  expira_en: string;
};

// Genera un código tipo TODO-XXXXXX (6 caracteres alfanuméricos, sin caracteres ambiguos)
const generarCodigo = () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return `TODO-${s}`;
};

// Fecha por defecto: 30 días a partir de hoy (formato input date)
const fechaPorDefecto = () => {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
};

const estadoDe = (c: Codigo): "Usado" | "Expirado" | "Activo" => {
  if (c.usado) return "Usado";
  if (new Date(c.expira_en).getTime() < Date.now()) return "Expirado";
  return "Activo";
};

export default function AdminCodigosDescuento() {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState("");
  const [expira, setExpira] = useState(fechaPorDefecto());
  const [creando, setCreando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [lista, setLista] = useState<Codigo[]>([]);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("codigos_descuento_proveedor")
      .select("id, codigo, usado, creado_en, expira_en")
      .order("creado_en", { ascending: false });
    setCargando(false);
    if (error) {
      toast({ title: "No se pudieron cargar los códigos", variant: "destructive" });
      return;
    }
    setLista((data as Codigo[]) ?? []);
  };

  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    const limpio = codigo.trim().toUpperCase();
    if (!limpio) return;
    setCreando(true);
    const { error } = await supabase.from("codigos_descuento_proveedor").insert({
      codigo: limpio,
      usado: false,
      expira_en: new Date(`${expira}T23:59:59-07:00`).toISOString(),
    });
    setCreando(false);
    if (error) {
      const duplicado = error.message?.includes("duplicate") || error.code === "23505";
      toast({
        title: duplicado ? "Ese código ya existe" : "No se pudo crear el código",
        description: duplicado ? "Genera otro o escribe uno distinto." : "Intenta de nuevo.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Código creado exitosamente", description: limpio });
    setCodigo("");
    setExpira(fechaPorDefecto());
    cargar();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4 text-primary" />
          Gestión de Códigos de Descuento para Proveedores
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Formulario de creación */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="TODO-XXXXXX"
              className="font-mono"
            />
            <Button type="button" variant="outline" onClick={() => setCodigo(generarCodigo())}>
              <Dices className="h-4 w-4 mr-1" /> Generar aleatorio
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            <Input type="date" value={expira} onChange={(e) => setExpira(e.target.value)} className="w-auto" />
            <Button className="flex-1" disabled={creando || !codigo.trim()} onClick={crear}>
              {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear Código"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            El código da el 100% de descuento en la suscripción anual de proveedor y es de un solo uso.
          </p>
        </div>

        {/* Lista de códigos */}
        {cargando ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay códigos creados.</p>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => {
              const estado = estadoDe(c);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-mono font-medium">{c.codigo}</p>
                    <p className="text-xs text-muted-foreground">
                      Creado: {formatHermosillo(c.creado_en)} · Expira: {formatHermosillo(c.expira_en)}
                    </p>
                  </div>
                  <Badge variant={estado === "Activo" ? "default" : estado === "Usado" ? "secondary" : "destructive"}>
                    {estado}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
