import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Truck, Package, MessageCircle, ToggleRight, Loader2, ShieldCheck } from "lucide-react";
import {
  MARCAS_UNIDAD, CONDICIONES, REMOLQUES, DIMENSIONES, LUGARES_CARGA, TEMPERATURAS, TAMANOS,
  type FleteAnuncio, type FleteTipo, enlaceWhatsAppFlete,
} from "@/lib/fletes";

type Geo = Record<string, string[]>;
const sel = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm";

function NativeSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function LugarSelector({ geo, estado, municipio, onChange }: { geo: Geo; estado: string; municipio: string; onChange: (e: string, m: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NativeSelect value={estado} onChange={(e) => onChange(e, "")} options={Object.keys(geo)} placeholder="Estado" />
      <NativeSelect value={municipio} onChange={(m) => onChange(estado, m)} options={geo[estado] ?? []} placeholder="Ciudad" />
    </div>
  );
}

export default function Fletes() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [registro, setRegistro] = useState<{ rfc_verificado: boolean; nombre_negocio: string; rfc: string } | null>(null);
  const [suscripcionOk, setSuscripcionOk] = useState(false);
  const [acceso, setAcceso] = useState(false);
  const [searchParams] = useSearchParams();
  const busco = searchParams.get("busco");
  // "Busco transportistas" = soy remitente; "Busco cargas" = soy transportista.
  const [papel, setPapel] = useState<FleteTipo | null>(busco === "transportistas" ? "remitente" : busco === "cargas" ? "transportista" : null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [geo, setGeo] = useState<Geo>({});
  const [anuncios, setAnuncios] = useState<FleteAnuncio[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);

  // Registro
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [rfc, setRfc] = useState("");
  const [validando, setValidando] = useState(false);

  const cargarEstado = async () => {
    if (!user) return;
    setCargando(true);
    const [{ data: reg }, { data: perfil }, { data: ok }] = await Promise.all([
      supabase.from("fletes_proveedores" as any).select("rfc_verificado, nombre_negocio, rfc").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("suscripcion_activa, suscripcion_expira_en").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("fletes_tiene_acceso" as any, { _uid: user.id }),
    ]);
    setRegistro((reg as any) ?? null);
    if (reg) { setNombreNegocio((reg as any).nombre_negocio); setRfc((reg as any).rfc); }
    const p: any = perfil;
    setSuscripcionOk(!!p?.suscripcion_activa && (!p?.suscripcion_expira_en || new Date(p.suscripcion_expira_en) > new Date()));
    setAcceso(!!ok);
    setCargando(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    cargarEstado();
    fetch("/data/estados-municipios-mx.json").then((r) => r.json()).then(setGeo).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Listado: el transportista ve cargas; el remitente ve transportistas. En tiempo real.
  const tipoListado: FleteTipo | null = papel === "transportista" ? "remitente" : papel === "remitente" ? "transportista" : null;
  const cargarAnuncios = async () => {
    if (!tipoListado) return;
    const { data } = await supabase.from("fletes_anuncios" as any).select("*")
      .eq("tipo", tipoListado).eq("disponible", true).neq("user_id", user!.id)
      .order("editado_at", { ascending: false }).limit(200);
    setAnuncios((data as any) ?? []);
  };
  useEffect(() => {
    if (!acceso || !tipoListado) return;
    cargarAnuncios();
    const ch = supabase.channel(`fletes-${tipoListado}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fletes_anuncios" }, () => cargarAnuncios())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceso, tipoListado]);

  const validarRfc = async () => {
    setValidando(true);
    const { data, error } = await supabase.functions.invoke("fletes-verificar-rfc", { body: { nombre_negocio: nombreNegocio, rfc } });
    setValidando(false);
    const msg = (data as any)?.error || (error as any)?.context?.error || null;
    if (error || (data as any)?.error) {
      let texto = msg;
      try { texto = texto || (await (error as any)?.context?.json?.())?.error; } catch { /* sin detalle */ }
      toast({ title: "RFC no validado", description: texto || "No se pudo validar el RFC.", variant: "destructive" });
      return;
    }
    toast({ title: "RFC validado ante el SAT" });
    cargarEstado();
  };

  if (cargando) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background p-4 pb-40 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => (papel && !busco ? setPapel(null) : navigate(-1))}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Fletes</h1>
        {acceso && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate("/fletes/mis-disponibles")}>
            <ToggleRight className="h-4 w-4 mr-1" /> Mis Disponibles
          </Button>
        )}
      </div>

      {!acceso && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fletes es solo para fleteros verificados</CardTitle>
            <CardDescription>Necesitas dos cosas: tu RFC validado ante el SAT y tu suscripción anual de proveedor de $500 activa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium flex items-center gap-2">1. RFC {registro?.rfc_verificado && <Badge><ShieldCheck className="h-3 w-3 mr-1" />Validado</Badge>}</p>
              {!registro?.rfc_verificado && (
                <>
                  <Label>Nombre del negocio o Carta Porte</Label>
                  <Input value={nombreNegocio} maxLength={150} onChange={(e) => setNombreNegocio(e.target.value)} />
                  <Label>RFC</Label>
                  <Input value={rfc} maxLength={13} onChange={(e) => setRfc(e.target.value.toUpperCase())} placeholder="12 o 13 caracteres" />
                  <Button className="w-full" disabled={validando || nombreNegocio.trim().length < 3 || rfc.length < 12} onClick={validarRfc}>
                    {validando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar RFC con el SAT"}
                  </Button>
                </>
              )}
            </div>
            <div className="space-y-2">
              <p className="font-medium flex items-center gap-2">2. Suscripción anual de $500 {suscripcionOk && <Badge>Activa</Badge>}</p>
              {!suscripcionOk && (
                <Button variant="secondary" className="w-full" onClick={() => navigate("/dashboard")}>Activar mi cuenta de Proveedor</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {acceso && !papel && (
        <div className="grid gap-3">
          <Button className="h-20 text-lg" onClick={() => setPapel("transportista")}><Truck className="h-6 w-6 mr-2" /> Soy Transportista</Button>
          <Button className="h-20 text-lg" variant="secondary" onClick={() => setPapel("remitente")}><Package className="h-6 w-6 mr-2" /> Soy Remitente de Carga</Button>
        </div>
      )}

      {acceso && papel && (
        <>
          <Button className="w-full" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? "Cerrar" : papel === "transportista" ? "Publicar mi unidad en una ciudad" : "Publicar una carga"}
          </Button>
          {mostrarForm && (
            <FormularioFlete tipo={papel} geo={geo} userId={user!.id}
              onGuardado={() => { setMostrarForm(false); toast({ title: "Anuncio publicado", description: "Lo puedes encender o apagar en Mis Disponibles." }); }} />
          )}
          <h2 className="font-semibold pt-2">{papel === "transportista" ? "Cargas listas para salir" : "Transportistas disponibles"}</h2>
          <LugarSelector geo={geo} estado={filtroEstado} municipio={filtroMunicipio}
            onChange={(e, m) => { setFiltroEstado(e); setFiltroMunicipio(m); }} />
          {(() => {
            const campoE = papel === "transportista" ? "destino_estado" : "ciudad_estado";
            const campoM = papel === "transportista" ? "destino_municipio" : "ciudad_municipio";
            const lista = anuncios.filter((a: any) => (!filtroEstado || a[campoE] === filtroEstado) && (!filtroMunicipio || a[campoM] === filtroMunicipio));
            if (lista.length === 0) return <p className="text-sm text-muted-foreground">Por ahora no hay anuncios encendidos{filtroMunicipio ? ` en ${filtroMunicipio}` : ""}.</p>;
            const grupos: Record<string, FleteAnuncio[]> = {};
            lista.forEach((a: any) => { const k = a[campoM] ? `${a[campoM]}, ${a[campoE]}` : "Sin municipio"; (grupos[k] ||= []).push(a); });
            return Object.entries(grupos).sort(([x], [y]) => x.localeCompare(y)).map(([k, arr]) => (
              <div key={k} className="space-y-2">
                <p className="text-sm font-semibold text-primary pt-2">{k} · {arr.length}</p>
                {arr.map((a) => <TarjetaFlete key={a.id} a={a} yoSoy={papel} />)}
              </div>
            ));
          })()}
        </>
      )}
    </div>
  );
}

function TarjetaFlete({ a, yoSoy }: { a: FleteAnuncio; yoSoy: FleteTipo }) {
  const wa = enlaceWhatsAppFlete(a, yoSoy);
  const datos = a.tipo === "transportista"
    ? [a.marca && `${a.marca}${a.modelo ? ` ${a.modelo}` : ""}`, a.remolque, a.dimensiones, a.condiciones && `Condiciones ${a.condiciones}`,
       a.ciudad_municipio && `Disponible en ${a.ciudad_municipio}, ${a.ciudad_estado}`,
       a.destinos_preferidos?.length ? `Prefiere: ${a.destinos_preferidos.join(", ")}` : null]
    : [a.tipo_carga, a.lugar_carga && `Carga en: ${a.lugar_carga}`, a.temperatura, a.tamano && `Requiere: ${a.tamano}`,
       a.destino_municipio && `Destino: ${a.destino_municipio}, ${a.destino_estado}`];
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <p className="font-semibold">{a.titulo}</p>
        {a.nombre_contacto && <p className="text-xs text-muted-foreground">{a.nombre_contacto}</p>}
        <ul className="text-sm space-y-0.5">{datos.filter(Boolean).map((d, i) => <li key={i}>• {d}</li>)}</ul>
        <Button className="w-full" disabled={!wa} onClick={() => wa && window.open(wa, "_blank")}>
          <MessageCircle className="h-4 w-4 mr-2" /> {wa ? "Contactar por WhatsApp" : "Sin teléfono registrado"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FormularioFlete({ tipo, geo, userId, onGuardado }: { tipo: FleteTipo; geo: Geo; userId: string; onGuardado: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [destinos, setDestinos] = useState<string[]>([]);
  const [destEstado, setDestEstado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const anios = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: 40 }, (_, i) => String(y - i)); }, []);

  const guardar = async () => {
    let fila: Record<string, unknown>;
    if (tipo === "transportista") {
      if (!f.marca || !f.remolque || !f.dimensiones || !f.ciudad_municipio) {
        toast({ title: "Faltan datos", description: "Marca, remolque, dimensiones y ciudad son obligatorios.", variant: "destructive" }); return;
      }
      fila = { titulo: `Flete ${f.ciudad_municipio}`, marca: f.marca, modelo: f.modelo ? Number(f.modelo) : null, condiciones: f.condiciones || null,
        remolque: f.remolque, dimensiones: f.dimensiones, ciudad_estado: f.ciudad_estado, ciudad_municipio: f.ciudad_municipio, destinos_preferidos: destinos };
    } else {
      const carga = (f.tipo_carga ?? "").trim().slice(0, 120);
      if (!carga || !f.destino_municipio) {
        toast({ title: "Faltan datos", description: "Tipo de carga y destino son obligatorios.", variant: "destructive" }); return;
      }
      fila = { titulo: `${carga} a ${f.destino_municipio}`, tipo_carga: carga, lugar_carga: f.lugar_carga || null, temperatura: f.temperatura || null,
        tamano: f.tamano || null, destino_estado: f.destino_estado, destino_municipio: f.destino_municipio };
    }
    setGuardando(true);
    const { error } = await supabase.from("fletes_anuncios" as any).insert({ ...fila, tipo, user_id: userId });
    setGuardando(false);
    if (error) { toast({ title: "No se pudo publicar", description: error.message, variant: "destructive" }); return; }
    setF({}); setDestinos([]); onGuardado();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {tipo === "transportista" ? (
          <>
            <Label>Marca de la unidad</Label><NativeSelect value={f.marca ?? ""} onChange={set("marca")} options={MARCAS_UNIDAD} placeholder="Elige marca" />
            <Label>Modelo (año)</Label><NativeSelect value={f.modelo ?? ""} onChange={set("modelo")} options={anios} placeholder="Elige año" />
            <Label>Condiciones físicas</Label><NativeSelect value={f.condiciones ?? ""} onChange={set("condiciones")} options={CONDICIONES} placeholder="Elige porcentaje" />
            <Label>Tipo de remolque</Label><NativeSelect value={f.remolque ?? ""} onChange={set("remolque")} options={REMOLQUES} placeholder="Elige remolque" />
            <Label>Dimensiones</Label><NativeSelect value={f.dimensiones ?? ""} onChange={set("dimensiones")} options={DIMENSIONES} placeholder="Elige medida" />
            <Label>Ciudad donde está disponible</Label>
            <LugarSelector geo={geo} estado={f.ciudad_estado ?? ""} municipio={f.ciudad_municipio ?? ""}
              onChange={(e, m) => setF((p) => ({ ...p, ciudad_estado: e, ciudad_municipio: m }))} />
            <p className="text-xs text-muted-foreground">Haz un anuncio por cada ciudad. Luego enciendes o apagas cada una en Mis Disponibles.</p>
            <Label>Destinos preferidos (puedes elegir varios)</Label>
            <LugarSelector geo={geo} estado={destEstado} municipio=""
              onChange={(e, m) => { setDestEstado(e); if (m && !destinos.includes(m)) setDestinos([...destinos, m]); }} />
            <div className="flex flex-wrap gap-1">
              {destinos.map((d) => <Badge key={d} variant="secondary" className="cursor-pointer" onClick={() => setDestinos(destinos.filter((x) => x !== d))}>{d} ✕</Badge>)}
            </div>
          </>
        ) : (
          <>
            <Label>Tipo de carga</Label><Input maxLength={120} value={f.tipo_carga ?? ""} onChange={(e) => set("tipo_carga")(e.target.value)} placeholder="Ej. Pepino" />
            <Label>Lugar de carga</Label><NativeSelect value={f.lugar_carga ?? ""} onChange={set("lugar_carga")} options={LUGARES_CARGA} placeholder="Elige lugar" />
            <Label>Temperatura</Label><NativeSelect value={f.temperatura ?? ""} onChange={set("temperatura")} options={TEMPERATURAS} placeholder="Elige temperatura" />
            <Label>Tamaño requerido</Label><NativeSelect value={f.tamano ?? ""} onChange={set("tamano")} options={TAMANOS} placeholder="Elige tamaño" />
            <Label>Destino</Label>
            <LugarSelector geo={geo} estado={f.destino_estado ?? ""} municipio={f.destino_municipio ?? ""}
              onChange={(e, m) => setF((p) => ({ ...p, destino_estado: e, destino_municipio: m }))} />
          </>
        )}
        <Button className="w-full" disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar"}</Button>
      </CardContent>
    </Card>
  );
}
