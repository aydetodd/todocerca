import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import programacionData from "@/data/todocercaTvProgramacion.json";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Crown, Lock, Share2, Youtube, Facebook, Music2, Bell, CheckCircle2, Radio } from "lucide-react";

type Programa = {
  hora: string;
  titulo: string;
  zona: string;
  icono: string;
  tags: string[];
  descripcion: string;
};

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"] as const;
const DIAS_LABEL: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const MESES_CORTO = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

const programacion = programacionData as Record<string, Programa[]>;

function startOfWeekMonday(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtCorto(d: Date) {
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

function parseHora(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

export default function TodoCercaTv() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const monday = useMemo(() => startOfWeekMonday(today), [today]);
  const semana = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      return { date: d, key: DIAS[d.getDay()] };
    }), [monday]);

  const [selectedIdx, setSelectedIdx] = useState(() =>
    semana.findIndex(s => s.date.getTime() === today.getTime()) >= 0
      ? semana.findIndex(s => s.date.getTime() === today.getTime()) : 0);
  const [now, setNow] = useState(new Date());
  const [premium, setPremium] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [openPrograma, setOpenPrograma] = useState<Programa | null>(null);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const checkSubscription = async () => {
    if (!user) { setPremium(false); return; }
    try {
      const { data } = await supabase.functions.invoke("tv-check-subscription");
      setPremium(!!data?.subscribed);
    } catch { setPremium(false); }
  };

  useEffect(() => { checkSubscription(); }, [user]);

  useEffect(() => {
    if (searchParams.get("premium") === "success") {
      toast.success("¡Bienvenido a TodoCerca TV Premium!");
      setTimeout(checkSubscription, 1500);
      searchParams.delete("premium");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const handleSubscribe = async () => {
    if (!user) { toast.error("Inicia sesión para suscribirte"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("tv-create-checkout");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Error al iniciar pago");
    } finally { setLoading(false); }
  };

  const selected = semana[selectedIdx];
  const isPast = selected && selected.date.getTime() < today.getTime();
  const isToday = selected && selected.date.getTime() === today.getTime();
  const programasDelDia = programacion[selected?.key] || [];
  const locked = isPast && !premium;

  // AHORA / PRÓXIMO (basado en hoy real)
  const todayKey = DIAS[today.getDay()];
  const programasHoy = programacion[todayKey] || [];
  const minutosAhora = now.getHours() * 60 + now.getMinutes();
  const ahora = programasHoy.find((p, i) => {
    const ini = parseHora(p.hora);
    const fin = i + 1 < programasHoy.length ? parseHora(programasHoy[i + 1].hora) : ini + 30;
    return minutosAhora >= ini && minutosAhora < fin;
  });
  const proximo = programasHoy.find(p => parseHora(p.hora) > minutosAhora);
  const segundosARestar = proximo
    ? Math.max(0, parseHora(proximo.hora) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()))
    : 0;
  const mmss = `${String(Math.floor(segundosARestar / 60)).padStart(2, "0")}:${String(segundosARestar % 60).padStart(2, "0")}`;

  const handleProgramaClick = (p: Programa) => {
    if (locked) { setShowPaywall(true); return; }
    setOpenPrograma(p);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: "TodoCerca TV", url });
      else { await navigator.clipboard.writeText(url); toast.success("Enlace copiado"); }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <BackButton />
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" /> TodoCerca TV
          </h1>
          {!premium ? (
            <Button size="sm" variant="default" onClick={handleSubscribe} disabled={loading}>
              <Crown className="h-4 w-4" /> $50
            </Button>
          ) : (
            <Badge variant="default" className="bg-amber-500"><Crown className="h-3 w-3 mr-1" />Premium</Badge>
          )}
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* AHORA / PRÓXIMO */}
        <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-destructive mb-1">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> AHORA
              </div>
              {ahora ? (
                <div className="text-sm">
                  <span className="mr-2">{ahora.icono}</span>
                  <strong>{ahora.titulo}</strong> · <span className="text-muted-foreground">{ahora.zona}</span>
                </div>
              ) : <div className="text-sm text-muted-foreground">Sin programación ahora</div>}
            </div>
            {proximo && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">⏭️ PRÓXIMO en {mmss}</div>
                <div className="text-sm">
                  <span className="mr-2">{proximo.icono}</span>
                  {proximo.hora} — <strong>{proximo.titulo}</strong>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Selector días */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 snap-x">
          {semana.map((s, i) => {
            const esHoy = s.date.getTime() === today.getTime();
            const esPasado = s.date.getTime() < today.getTime();
            const esSelected = i === selectedIdx;
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`snap-start flex-shrink-0 px-3 py-2 rounded-xl border-2 text-xs transition-all ${
                  esSelected ? "scale-105 border-foreground shadow-lg bg-primary/10" :
                  esHoy ? "border-amber-500 bg-gradient-to-br from-amber-500/20 to-primary/20" :
                  esPasado ? "opacity-60 border-dashed" : "border-border"
                }`}
              >
                <div className="font-semibold">{DIAS_LABEL[s.key]}</div>
                <div className="text-[10px] text-muted-foreground">{fmtCorto(s.date)}</div>
                {esHoy && <div className="text-[9px] font-bold text-amber-600 mt-1">HOY</div>}
                {esPasado && <CheckCircle2 className="h-3 w-3 mx-auto mt-1 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        {locked && (
          <Card className="p-4 bg-amber-500/10 border-amber-500/40">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Contenido Premium</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Los programas de días pasados requieren suscripción ($50 MXN/mes).
                </p>
                <Button size="sm" onClick={handleSubscribe} disabled={loading}>
                  <Crown className="h-4 w-4" /> Suscribirse
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Lista de programas */}
        <div className="space-y-2">
          {programasDelDia.map((p, i) => {
            const minP = parseHora(p.hora);
            const minSig = i + 1 < programasDelDia.length ? parseHora(programasDelDia[i + 1].hora) : minP + 30;
            const enVivo = isToday && minutosAhora >= minP && minutosAhora < minSig;
            const transmitido = isPast || (isToday && minutosAhora >= minSig);
            return (
              <button
                key={i}
                onClick={() => handleProgramaClick(p)}
                className={`w-full text-left p-3 rounded-lg border bg-card flex items-center gap-3 transition-all hover:border-primary ${
                  locked ? "opacity-60" : ""
                }`}
              >
                <div className="text-xs font-mono text-muted-foreground w-12">{p.hora}</div>
                <div className="text-2xl">{p.icono}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground">{p.zona}</div>
                </div>
                <div>
                  {locked ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-500"><Lock className="h-3 w-3 mr-1" />Premium</Badge>
                  ) : enVivo ? (
                    <Badge className="bg-destructive">EN VIVO</Badge>
                  ) : transmitido ? (
                    <Badge variant="secondary">✓ Transmitido</Badge>
                  ) : (
                    <Badge className="bg-emerald-600">Gratis</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Plataformas externas */}
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Míranos también en</h3>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open("https://youtube.com", "_blank")}>
              <Youtube className="h-4 w-4" /> YouTube
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open("https://facebook.com", "_blank")}>
              <Facebook className="h-4 w-4" /> Facebook
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open("https://tiktok.com", "_blank")}>
              <Music2 className="h-4 w-4" /> TikTok
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            * Enlaces de marcador. Reemplaza con tus canales reales.
          </p>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleShare}>
            <Share2 className="h-4 w-4" /> Compartir
          </Button>
          {!premium && (
            <Button className="flex-1" onClick={handleSubscribe} disabled={loading}>
              <Crown className="h-4 w-4" /> Premium $50
            </Button>
          )}
        </div>
      </main>

      {/* Modal programa */}
      <Dialog open={!!openPrograma} onOpenChange={(o) => !o && setOpenPrograma(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{openPrograma?.icono}</span>
              {openPrograma?.titulo}
            </DialogTitle>
            <DialogDescription>
              {openPrograma?.hora} · {openPrograma?.zona}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{openPrograma?.descripcion}</p>
          <div className="flex flex-wrap gap-1">
            {openPrograma?.tags.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}
          </div>
          <Button onClick={() => toast.success("Te recordaremos antes del programa")}>
            <Bell className="h-4 w-4" /> Recordarme
          </Button>
        </DialogContent>
      </Dialog>

      {/* Paywall */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /> Hazte Premium</DialogTitle>
            <DialogDescription>
              Por solo $50 MXN/mes desbloquea todo el archivo de programas pasados. El contenido de hoy y futuro siempre es gratis.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleSubscribe} disabled={loading}>
            {loading ? "Procesando..." : "Suscribirme $50/mes"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
