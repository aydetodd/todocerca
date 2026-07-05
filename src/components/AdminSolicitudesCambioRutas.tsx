import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, XCircle, Clock, MessageSquare } from 'lucide-react';

interface Solicitud {
  id: string;
  ruta_maestra_id: string;
  solicitante_nombre: string | null;
  solicitante_qard: string | null;
  solicitante_telefono: string | null;
  tipo_cambio: 'renombrar' | 'trazado' | 'geocercas' | 'precio' | 'otro';
  propuesta: any;
  motivo: string;
  estado: 'pending' | 'approved' | 'rejected';
  admin_motivo_rechazo: string | null;
  created_at: string;
  admin_resuelto_at: string | null;
}

interface Maestra {
  id: string;
  nombre: string;
}

const TIPO_LABEL: Record<Solicitud['tipo_cambio'], string> = {
  renombrar: 'Renombrar',
  trazado: 'Cambio de trazado',
  geocercas: 'Ajuste de geocercas A/B',
  precio: 'Cambio de precio',
  otro: 'Otro',
};

export default function AdminSolicitudesCambioRutas() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Solicitud[]>([]);
  const [rutas, setRutas] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Solicitud | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [solRes, rutasRes] = await Promise.all([
      supabase
        .from('ruta_maestra_solicitudes' as any)
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('rutas_foraneas_maestras' as any).select('id, nombre'),
    ]);
    if (!solRes.error) setItems((solRes.data as any) || []);
    if (!rutasRes.error) {
      const map: Record<string, string> = {};
      ((rutasRes.data as any as Maestra[]) || []).forEach((r) => (map[r.id] = r.nombre));
      setRutas(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-solicitudes-cambio')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ruta_maestra_solicitudes' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const handleApprove = async (s: Solicitud) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_approve_solicitud_cambio' as any, { _id: s.id });
    setBusy(false);
    if (error) toast({ title: 'No se pudo aprobar', description: error.message, variant: 'destructive' });
    else toast({ title: 'Solicitud aprobada', description: 'Se aplicó el cambio a la ruta maestra.' });
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_reject_solicitud_cambio' as any, {
      _id: rejectTarget.id,
      _motivo: rejectReason.trim(),
    });
    setBusy(false);
    if (error) toast({ title: 'No se pudo rechazar', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Solicitud rechazada' });
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  const filtered = items.filter((i) => i.estado === filter);
  const pendingCount = items.filter((i) => i.estado === 'pending').length;

  const renderPropuesta = (s: Solicitud) => {
    const p = s.propuesta || {};
    if (s.tipo_cambio === 'renombrar') return <div>Nuevo nombre: <strong>{p.nombre}</strong></div>;
    if (s.tipo_cambio === 'precio') return <div>Nuevo precio: <strong>${p.precio}</strong></div>;
    if (s.tipo_cambio === 'geocercas')
      return (
        <div className="space-y-0.5">
          <div>A: {p.origin_lat?.toFixed?.(5)}, {p.origin_lng?.toFixed?.(5)}</div>
          <div>B: {p.destination_lat?.toFixed?.(5)}, {p.destination_lng?.toFixed?.(5)}</div>
          <div>Radio: {p.radius_m} m</div>
        </div>
      );
    if (s.tipo_cambio === 'trazado') return <div className="italic">"{p.descripcion}"</div>;
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Solicitudes de cambio a rutas maestras
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-1">
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Los concesionarios piden cambios (nombre, trazado, geocercas, precio) con evidencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1">
          {(['pending', 'approved', 'rejected'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="text-xs h-8"
            >
              {f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobadas' : 'Rechazadas'}
              <span className="ml-1 opacity-70">({items.filter((i) => i.estado === f).length})</span>
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin solicitudes en esta bandeja.</p>
        ) : (
          filtered.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {s.estado === 'approved' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : s.estado === 'pending' ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium text-sm">{TIPO_LABEL[s.tipo_cambio]}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </div>

              <div><strong>Ruta:</strong> {rutas[s.ruta_maestra_id] || s.ruta_maestra_id}</div>
              <div className="rounded bg-muted p-2">
                <div className="font-medium mb-1">Propuesta:</div>
                {renderPropuesta(s)}
              </div>
              <div><strong>Motivo:</strong> {s.motivo}</div>

              <div className="rounded border bg-emerald-50 p-2 space-y-0.5">
                <div className="font-medium text-emerald-800">Evidencia del concesionario</div>
                <div>Nombre: {s.solicitante_nombre || '—'}</div>
                <div>QaRd: {s.solicitante_qard || '—'}</div>
                <div>Tel: {s.solicitante_telefono || '—'}</div>
              </div>

              {s.estado === 'rejected' && s.admin_motivo_rechazo && (
                <div className="text-red-600">Rechazada: {s.admin_motivo_rechazo}</div>
              )}

              {s.estado === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => handleApprove(s)} disabled={busy} className="flex-1 h-8">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRejectTarget(s)} disabled={busy} className="flex-1 h-8">
                    <XCircle className="h-3 w-3 mr-1" /> Rechazar
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo (visible para el concesionario)</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: Falta evidencia." />
            </div>
            <Button onClick={handleReject} disabled={busy || !rejectReason.trim()} variant="destructive" className="w-full">
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              Rechazar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
