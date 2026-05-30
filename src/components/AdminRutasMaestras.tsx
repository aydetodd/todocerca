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
import { Loader2, CheckCircle2, XCircle, Clock, Eye, MapPin } from 'lucide-react';

interface Maestra {
  id: string;
  nombre: string;
  estado: 'pending' | 'approved' | 'rejected';
  created_by_user_id: string;
  created_at: string;
  rechazo_motivo: string | null;
  route_origin_lat: number | null;
  route_origin_lng: number | null;
  route_destination_lat: number | null;
  route_destination_lng: number | null;
  route_geofence_radius_m: number | null;
  route_geojson: any;
}

export default function AdminRutasMaestras() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Maestra[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [busy, setBusy] = useState(false);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<Maestra | null>(null);
  const [approveName, setApproveName] = useState('');

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<Maestra | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rutas_foraneas_maestras' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setItems((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-rutas-maestras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_foraneas_maestras' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_approve_ruta_maestra' as any, {
      _id: approveTarget.id,
      _nombre_final: approveName.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'No se pudo aprobar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ruta aprobada', description: 'Ya está disponible para todos los concesionarios.' });
      setApproveTarget(null);
      setApproveName('');
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_reject_ruta_maestra' as any, {
      _id: rejectTarget.id,
      _motivo: rejectReason.trim(),
    });
    setBusy(false);
    if (error) {
      toast({ title: 'No se pudo rechazar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ruta rechazada' });
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  const filtered = items.filter((i) => i.estado === filter);
  const pendingCount = items.filter((i) => i.estado === 'pending').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Rutas Foráneas Maestras
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-1">{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Catálogo único de rutas foráneas. Solo tú puedes aprobar, renombrar o editar.
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
          <p className="text-sm text-muted-foreground text-center py-4">Sin rutas {filter === 'pending' ? 'pendientes' : filter === 'approved' ? 'aprobadas' : 'rechazadas'}.</p>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {m.estado === 'approved' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : m.estado === 'pending' ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium text-sm">{m.nombre}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>

              {m.route_origin_lat != null && m.route_destination_lat != null && (
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>A (origen): {m.route_origin_lat.toFixed(4)}, {m.route_origin_lng?.toFixed(4)}</div>
                  <div>B (destino): {m.route_destination_lat.toFixed(4)}, {m.route_destination_lng?.toFixed(4)}</div>
                  <div>Radio: {m.route_geofence_radius_m} m</div>
                </div>
              )}

              {m.estado === 'rejected' && m.rechazo_motivo && (
                <p className="text-xs text-red-600">Motivo: {m.rechazo_motivo}</p>
              )}

              {m.estado === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setApproveTarget(m);
                      setApproveName(m.nombre);
                    }}
                    className="flex-1 h-8 text-xs"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectTarget(m)}
                    className="flex-1 h-8 text-xs"
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Rechazar
                  </Button>
                </div>
              )}

              {m.estado === 'approved' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setApproveTarget(m);
                    setApproveName(m.nombre);
                  }}
                  className="w-full h-8 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" /> Renombrar
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approveTarget?.estado === 'approved' ? 'Renombrar ruta maestra' : 'Aprobar ruta maestra'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre oficial</Label>
              <Input
                value={approveName}
                onChange={(e) => setApproveName(e.target.value)}
                placeholder="Cajeme – Bácum"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Puedes corregir o unificar el nombre (ej: "Cajeme" → "Cajeme (Cd. Obregón)").
              </p>
            </div>
            <Button onClick={handleApprove} disabled={busy || !approveName.trim()} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {approveTarget?.estado === 'approved' ? 'Guardar nombre' : 'Aprobar y publicar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar ruta maestra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo (visible para el concesionario)</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej: El trazado está incompleto / Nombre duplicado"
              />
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
