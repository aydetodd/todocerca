import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Droplet, Trash2, Lightbulb, TrafficCone, Construction, Plus, X, Check, Crosshair, ChevronDown, ChevronUp, Filter, MapPin, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentCity } from '@/hooks/useCurrentCity';

// ============ Categorías ============
type Category = 'bache' | 'fuga_agua' | 'fuga_drenaje' | 'alumbrado' | 'basura' | 'semaforo';

const CATEGORIES: Record<Category, { label: string; color: string; emoji: string; Icon: any }> = {
  bache:        { label: 'Baches',             color: '#dc2626', emoji: '🕳️', Icon: Construction },
  fuga_agua:    { label: 'Fuga de agua',       color: '#2563eb', emoji: '💧', Icon: Droplet },
  fuga_drenaje: { label: 'Fuga de drenaje',    color: '#111827', emoji: '🚽', Icon: Droplet },
  alumbrado:    { label: 'Alumbrado',          color: '#eab308', emoji: '💡', Icon: Lightbulb },
  basura:       { label: 'Basura',             color: '#6b7280', emoji: '🗑️', Icon: Trash2 },
  semaforo:     { label: 'Semáforo',           color: '#16a34a', emoji: '🚦', Icon: TrafficCone },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

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

  // Filtros visibles
  const [visibleCategories, setVisibleCategories] = useState<Set<Category>>(new Set(CATEGORY_KEYS));
  const [filterOpen, setFilterOpen] = useState(false);

  const toggleCategory = (k: Category) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const setAll = (on: boolean) => setVisibleCategories(on ? new Set(CATEGORY_KEYS) : new Set());
  const onlyOne = (k: Category) => setVisibleCategories(new Set([k]));

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const reportsLayerRef = useRef<L.LayerGroup | null>(null);
  const closuresLayerRef = useRef<L.LayerGroup | null>(null);
  const draftClosureLayerRef = useRef<L.Polyline | null>(null);

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

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    if ((container as any)._leaflet_id) delete (container as any)._leaflet_id;
    const map = L.map(container, { attributionControl: false }).setView(center, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);
    reportsLayerRef.current = L.layerGroup().addTo(map);
    closuresLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    return () => {
      map.remove();
      mapRef.current = null;
      reportsLayerRef.current = null;
      closuresLayerRef.current = null;
      draftClosureLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, map.getZoom());
    setTimeout(() => map.invalidateSize(), 50);
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      if (closureMode) setClosurePoints((p) => [...p, [e.latlng.lat, e.latlng.lng]]);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [closureMode]);

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

  useEffect(() => {
    const layer = reportsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    reports.filter((r) => visibleCategories.has(r.category)).forEach((r) => {
      const category = CATEGORIES[r.category];
      const marker = L.marker([r.lat, r.lng], { icon: ICONS[r.category] });
      const popup = document.createElement('div');
      popup.className = 'space-y-2 min-w-[200px]';

      const title = document.createElement('div');
      title.className = 'font-semibold flex items-center gap-1';
      title.textContent = `${category.emoji} ${category.label}`;
      popup.appendChild(title);

      if (r.note) {
        const note = document.createElement('p');
        note.className = 'text-xs';
        note.textContent = r.note;
        popup.appendChild(note);
      }

      const meta = document.createElement('div');
      meta.className = 'text-[10px] text-muted-foreground';
      meta.textContent = `${fmtDate(r.created_at)} · ••••${r.phone_last4}`;
      popup.appendChild(meta);

      const counts = document.createElement('div');
      counts.className = 'text-[10px]';
      counts.textContent = `✋ ${r.confirm_count}   ✓ ${r.resolve_count}/3`;
      popup.appendChild(counts);

      if (!myVotes[r.id]) {
        const actions = document.createElement('div');
        actions.className = 'flex gap-1';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'px-2 py-1 rounded border text-[11px]';
        confirmBtn.textContent = 'Sigue ahí';
        confirmBtn.onclick = () => handleVote(r.id, 'confirm');
        const resolveBtn = document.createElement('button');
        resolveBtn.className = 'px-2 py-1 rounded bg-primary text-primary-foreground text-[11px]';
        resolveBtn.textContent = 'Ya se resolvió';
        resolveBtn.onclick = () => handleVote(r.id, 'resolve');
        actions.append(confirmBtn, resolveBtn);
        popup.appendChild(actions);
      }

      if (isAdmin) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'w-full px-2 py-1 rounded bg-destructive text-destructive-foreground text-[11px]';
        deleteBtn.textContent = 'Eliminar (Admin)';
        deleteBtn.onclick = () => handleDeleteReport(r.id);
        popup.appendChild(deleteBtn);
      }

      marker.bindPopup(popup).addTo(layer);
    });
  }, [reports, myVotes, isAdmin, visibleCategories]);

  useEffect(() => {
    const layer = closuresLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    closures.forEach((c) => {
      const line = L.polyline(c.polyline, { color: '#dc2626', weight: 6, opacity: 0.85 });
      const popup = document.createElement('div');
      popup.className = 'space-y-1 min-w-[180px]';

      const title = document.createElement('div');
      title.className = 'font-semibold';
      title.style.color = '#dc2626';
      title.textContent = `🚧 ${c.name}`;
      popup.appendChild(title);

      if (c.reason) {
        const reason = document.createElement('p');
        reason.className = 'text-xs';
        reason.textContent = c.reason;
        popup.appendChild(reason);
      }

      if (c.reopen_estimated_at) {
        const reopen = document.createElement('p');
        reopen.className = 'text-[10px] text-muted-foreground';
        reopen.textContent = `Reapertura estimada: ${c.reopen_estimated_at}`;
        popup.appendChild(reopen);
      }

      if (isAdmin) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'w-full px-2 py-1 rounded bg-destructive text-destructive-foreground text-[11px]';
        deleteBtn.textContent = 'Eliminar (Admin)';
        deleteBtn.onclick = () => handleDeleteClosure(c.id);
        popup.appendChild(deleteBtn);
      }

      line.bindPopup(popup).addTo(layer);
    });
  }, [closures, isAdmin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (draftClosureLayerRef.current) {
      draftClosureLayerRef.current.remove();
      draftClosureLayerRef.current = null;
    }
    if (closureMode && closurePoints.length > 0) {
      draftClosureLayerRef.current = L.polyline(closurePoints, { color: '#dc2626', weight: 5, opacity: 0.6, dashArray: '8 6' }).addTo(map);
    }
  }, [closureMode, closurePoints]);

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
      </header>

      {/* Mapa */}
      <div className="flex-1 relative" style={{ minHeight: 300 }}>
        <div ref={mapContainerRef} className="h-full w-full" style={{ background: '#0f172a' }} />

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
        <div className="absolute bottom-24 left-0 right-0 z-[500] flex flex-col items-center gap-2 px-4">
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
            <>
              {/* Panel filtros */}
              <Card className="w-full max-w-md shadow-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFilterOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    Filtrar reportes ({visibleCategories.size}/{CATEGORY_KEYS.length})
                  </span>
                  {filterOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                {filterOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t">
                    <div className="flex gap-1.5 pt-2">
                      <Button size="sm" variant="secondary" className="h-7 text-[11px] px-2" onClick={() => setAll(true)}>
                        Todas
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => setAll(false)}>
                        Ninguna
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CATEGORY_KEYS.map((k) => {
                        const v = CATEGORIES[k];
                        const checked = visibleCategories.has(k);
                        return (
                          <div key={k} className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleCategory(k)}
                              className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[11px] transition ${
                                checked ? 'bg-accent' : 'opacity-50'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                style={{ background: v.color, color: 'white' }}
                              >
                                {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                              </span>
                              <span className="truncate">{v.label}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onlyOne(k)}
                              title="Solo este"
                              className="text-[9px] px-1.5 py-1 rounded border text-muted-foreground hover:bg-accent"
                            >
                              solo
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>

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
            </>
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
