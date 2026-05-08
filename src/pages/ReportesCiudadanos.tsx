import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, MapPin, AlertTriangle, Droplet, Trash2, Lightbulb, TrafficCone, Construction, Plus, X, Check, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ============ Categorías ============
type Category = 'bache' | 'fuga_agua' | 'fuga_drenaje' | 'alumbrado' | 'basura' | 'semaforo';

const CATEGORIES: Record<Category, { label: string; color: string; emoji: string; Icon: any }> = {
  bache:        { label: 'Bache',              color: '#78350f', emoji: '🕳️', Icon: Construction },
  fuga_agua:    { label: 'Fuga de agua',       color: '#0284c7', emoji: '💧', Icon: Droplet },
  fuga_drenaje: { label: 'Fuga de drenaje',    color: '#7c2d12', emoji: '🚽', Icon: Droplet },
  alumbrado:    { label: 'Alumbrado público',  color: '#ca8a04', emoji: '💡', Icon: Lightbulb },
  basura:       { label: 'Basura / escombro',  color: '#15803d', emoji: '🗑️', Icon: Trash2 },
  semaforo:     { label: 'Semáforo dañado',    color: '#7e22ce', emoji: '🚦', Icon: TrafficCone },
};

// ============ Iconos Leaflet ============
function makeIcon(emoji: string, color: string) {
  return L.divIcon({
    className: 'citizen-report-marker',
    html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:18px;line-height:1;">${emoji}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

const ICONS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, makeIcon(v.emoji, v.color)])
) as Record<Category, L.DivIcon>;

// ============ Tipos ============
interface Report {
  id: string;
  category: Category;
  lat: number;
  lng: number;
  note: string | null;
  phone_last4: string;
  status: string;
  confirm_count: number;
  resolve_count: number;
  created_at: string;
}

interface RoadClosure {
  id: string;
  name: string;
  reason: string | null;
  polyline: [number, number][];
  reopen_estimated_at: string | null;
  is_active: boolean;
}

// ============ Helper: re-center ============
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center[0], center[1]]);
  return null;
}

// Captura clicks para modo "tramo cerrado"
function ClickCapture({ onClick, enabled }: { onClick: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click(e) {
      if (enabled) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ============ Página ============
export default function ReportesCiudadanos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [center, setCenter] = useState<[number, number]>([29.0729, -110.9559]); // Hermosillo default
  const [reports, setReports] = useState<Report[]>([]);
  const [closures, setClosures] = useState<RoadClosure[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, 'confirm' | 'resolve'>>({});

  // Reportar
  const [reportMode, setReportMode] = useState(false);
  const [reportPos, setReportPos] = useState<[number, number] | null>(null);
  const [reportCategory, setReportCategory] = useState<Category>('bache');
  const [reportNote, setReportNote] = useState('');
  const [savingReport, setSavingReport] = useState(false);

  // Tramo cerrado
  const [closureMode, setClosureMode] = useState(false);
  const [closurePoints, setClosurePoints] = useState<[number, number][]>([]);
  const [closureName, setClosureName] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [closureReopen, setClosureReopen] = useState('');
  const [showClosureSave, setShowClosureSave] = useState(false);
  const [savingClosure, setSavingClosure] = useState(false);

  const mapRef = useRef<L.Map | null>(null);

  // Detect admin + GPS center
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('consecutive_number').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(data?.consecutive_number === 1));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { timeout: 5000 }
      );
    }
  }, [user]);

  // Cargar datos
  const loadData = async () => {
    const [{ data: r }, { data: c }, votesRes] = await Promise.all([
      supabase.from('citizen_reports_public' as any).select('*').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('road_closures' as any).select('*').eq('is_active', true),
      user ? supabase.from('citizen_report_votes' as any).select('report_id, vote_type').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ]);
    setReports((r as any) || []);
    setClosures(((c as any) || []).map((x: any) => ({ ...x, polyline: x.polyline as [number, number][] })));
    const votesMap: Record<string, 'confirm' | 'resolve'> = {};
    (votesRes.data as any[] | null)?.forEach((v) => { votesMap[v.report_id] = v.vote_type; });
    setMyVotes(votesMap);
  };

  useEffect(() => {
    loadData();
    const ch = supabase
      .channel('citizen-reports-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citizen_reports' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'road_closures' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // ====== Acciones ======
  const handleSaveReport = async () => {
    if (!reportPos || !user) return;
    setSavingReport(true);
    const { error } = await supabase.from('citizen_reports' as any).insert({
      user_id: user.id,
      category: reportCategory,
      lat: reportPos[0],
      lng: reportPos[1],
      note: reportNote.trim() || null,
      phone_last4: '0000', // El trigger lo sobreescribe
    });
    setSavingReport(false);
    if (error) {
      toast.error('No se pudo guardar el reporte');
      return;
    }
    toast.success('Reporte enviado. ¡Gracias por tu colaboración!');
    setReportMode(false);
    setReportPos(null);
    setReportNote('');
    loadData();
  };

  const handleVote = async (reportId: string, type: 'confirm' | 'resolve') => {
    if (!user) return;
    if (myVotes[reportId]) {
      toast.info('Ya votaste en este reporte');
      return;
    }
    const { error } = await supabase.from('citizen_report_votes' as any).insert({
      report_id: reportId,
      user_id: user.id,
      vote_type: type,
    });
    if (error) {
      toast.error('No se pudo registrar tu voto');
      return;
    }
    toast.success(type === 'confirm' ? 'Confirmaste el reporte' : 'Marcaste como resuelto');
    loadData();
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('¿Eliminar este reporte?')) return;
    const { error } = await supabase.from('citizen_reports' as any).delete().eq('id', id);
    if (error) toast.error('No se pudo eliminar');
    else { toast.success('Reporte eliminado'); loadData(); }
  };

  const handleSaveClosure = async () => {
    if (closurePoints.length < 2 || !closureName.trim() || !user) {
      toast.error('Necesitas un nombre y al menos 2 puntos');
      return;
    }
    setSavingClosure(true);
    const { error } = await supabase.from('road_closures' as any).insert({
      name: closureName.trim(),
      reason: closureReason.trim() || null,
      polyline: closurePoints as any,
      reopen_estimated_at: closureReopen || null,
      created_by: user.id,
    });
    setSavingClosure(false);
    if (error) {
      toast.error('No se pudo guardar el tramo');
      return;
    }
    toast.success('Tramo cerrado registrado');
    setClosureMode(false);
    setClosurePoints([]);
    setClosureName('');
    setClosureReason('');
    setClosureReopen('');
    setShowClosureSave(false);
    loadData();
  };

  const handleDeleteClosure = async (id: string) => {
    if (!confirm('¿Eliminar este tramo cerrado?')) return;
    const { error } = await supabase.from('road_closures' as any).delete().eq('id', id);
    if (error) toast.error('No se pudo eliminar');
    else { toast.success('Tramo eliminado'); loadData(); }
  };

  // ====== Render ======
  const fmtDate = (s: string) => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <header className="bg-background/95 backdrop-blur border-b border-border z-[1000] safe-area-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/home')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight">Reportes Ciudadanos</h1>
            <p className="text-[10px] text-muted-foreground">Marca incidentes en tu ciudad</p>
          </div>
          {isAdmin && (
            <Badge variant="outline" className="text-[10px]">Admin</Badge>
          )}
        </div>
        {/* Leyenda compacta */}
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 shrink-0 text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: v.color }}>
              <span>{v.emoji}</span>
              <span>{v.label}</span>
            </div>
          ))}
        </div>
      </header>

      {/* Mapa */}
      <div className="flex-1 relative" style={{ minHeight: 300 }}>
        <MapContainer
          center={center}
          zoom={14}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          attributionControl={false}
          ref={(m) => {
            if (m && mapRef.current !== m) {
              mapRef.current = m;
              setTimeout(() => m.invalidateSize(), 100);
              setTimeout(() => m.invalidateSize(), 500);
            }
          }}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapRecenter center={center} />
          <ClickCapture
            enabled={closureMode}
            onClick={(lat, lng) => setClosurePoints((p) => [...p, [lat, lng]])}
          />

          {/* Pines de reportes */}
          {reports.map((r) => (
            <Marker key={r.id} position={[r.lat, r.lng]} icon={ICONS[r.category]}>
              <Popup>
                <div className="space-y-2 min-w-[200px]">
                  <div className="font-semibold flex items-center gap-1">
                    {CATEGORIES[r.category].emoji} {CATEGORIES[r.category].label}
                  </div>
                  {r.note && <p className="text-xs">{r.note}</p>}
                  <div className="text-[10px] text-muted-foreground">
                    {fmtDate(r.created_at)} · ••••{r.phone_last4}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">✋ {r.confirm_count}</Badge>
                    <Badge variant="secondary" className="text-[10px]">✓ {r.resolve_count}/3</Badge>
                  </div>
                  {!myVotes[r.id] ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px]" onClick={() => handleVote(r.id, 'confirm')}>
                        Sigue ahí
                      </Button>
                      <Button size="sm" className="flex-1 h-7 text-[11px]" onClick={() => handleVote(r.id, 'resolve')}>
                        Ya se resolvió
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Ya votaste: {myVotes[r.id] === 'confirm' ? 'Sigue ahí' : 'Resuelto'}</p>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="destructive" className="w-full h-7 text-[11px]" onClick={() => handleDeleteReport(r.id)}>
                      Eliminar (Admin)
                    </Button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Tramos cerrados */}
          {closures.map((c) => (
            <Polyline key={c.id} positions={c.polyline} pathOptions={{ color: '#dc2626', weight: 6, opacity: 0.85 }}>
              <Popup>
                <div className="space-y-1 min-w-[180px]">
                  <div className="font-semibold text-red-600">🚧 {c.name}</div>
                  {c.reason && <p className="text-xs">{c.reason}</p>}
                  {c.reopen_estimated_at && (
                    <p className="text-[10px] text-muted-foreground">Reapertura estimada: {c.reopen_estimated_at}</p>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="destructive" className="w-full h-7 text-[11px]" onClick={() => handleDeleteClosure(c.id)}>
                      Eliminar (Admin)
                    </Button>
                  )}
                </div>
              </Popup>
            </Polyline>
          ))}

          {/* Polilínea en construcción */}
          {closureMode && closurePoints.length > 0 && (
            <Polyline positions={closurePoints} pathOptions={{ color: '#dc2626', weight: 5, opacity: 0.6, dashArray: '8 6' }} />
          )}
        </MapContainer>

        {/* Mira central para reportar */}
        {reportMode && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-[500]">
            <div className="relative">
              <Crosshair className="h-12 w-12 text-primary drop-shadow-lg" strokeWidth={1.5} />
              <div className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            </div>
          </div>
        )}

        {/* Controles inferiores */}
        <div className="absolute bottom-4 left-0 right-0 z-[500] flex flex-col items-center gap-2 px-4">
          {reportMode ? (
            <Card className="w-full max-w-md p-3 shadow-xl">
              <p className="text-xs text-center mb-2 font-medium">Centra la mira sobre el incidente</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setReportMode(false); setReportPos(null); }}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!mapRef.current) return;
                    const c = mapRef.current.getCenter();
                    setReportPos([c.lat, c.lng]);
                  }}
                >
                  <Check className="h-4 w-4 mr-1" /> Fijar aquí
                </Button>
              </div>
            </Card>
          ) : closureMode ? (
            <Card className="w-full max-w-md p-3 shadow-xl">
              <p className="text-xs text-center mb-2 font-medium">
                Toca el mapa para agregar puntos del tramo ({closurePoints.length} pts)
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setClosurePoints((p) => p.slice(0, -1))} disabled={!closurePoints.length}>
                  Deshacer
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setClosureMode(false); setClosurePoints([]); }}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button size="sm" className="flex-1" disabled={closurePoints.length < 2} onClick={() => setShowClosureSave(true)}>
                  <Check className="h-4 w-4 mr-1" /> Guardar tramo
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex gap-2 flex-wrap justify-center">
              <Button size="lg" className="shadow-xl rounded-full" onClick={() => setReportMode(true)}>
                <Plus className="h-5 w-5 mr-1" /> Reportar incidente
              </Button>
              {isAdmin && (
                <Button size="lg" variant="destructive" className="shadow-xl rounded-full" onClick={() => setClosureMode(true)}>
                  <Construction className="h-5 w-5 mr-1" /> Tramo cerrado
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialog: completar reporte */}
      <Dialog open={!!reportPos} onOpenChange={(o) => !o && setReportPos(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalles del reporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo de incidente</Label>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setReportCategory(k)}
                    className={`p-2 rounded-lg border-2 text-center transition ${
                      reportCategory === k ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    <div className="text-xl">{v.emoji}</div>
                    <div className="text-[9px] leading-tight mt-0.5">{v.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Nota (opcional, máx. 200)</Label>
              <Textarea
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value.slice(0, 200))}
                placeholder="Detalles que ayuden a identificar el problema"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportPos(null)}>Cancelar</Button>
            <Button onClick={handleSaveReport} disabled={savingReport}>
              {savingReport ? 'Enviando...' : 'Enviar reporte'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: completar tramo */}
      <Dialog open={showClosureSave} onOpenChange={setShowClosureSave}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Datos del tramo cerrado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre / Calle *</Label>
              <Input value={closureName} onChange={(e) => setClosureName(e.target.value)} placeholder="Ej: Blvd. Morelos entre Reforma y 5 de Febrero" />
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Textarea value={closureReason} onChange={(e) => setClosureReason(e.target.value)} placeholder="Pavimentación, drenaje, evento, etc." rows={2} />
            </div>
            <div>
              <Label className="text-xs">Reapertura estimada</Label>
              <Input type="date" value={closureReopen} onChange={(e) => setClosureReopen(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClosureSave(false)}>Cancelar</Button>
            <Button onClick={handleSaveClosure} disabled={savingClosure}>
              {savingClosure ? 'Guardando...' : 'Guardar tramo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
