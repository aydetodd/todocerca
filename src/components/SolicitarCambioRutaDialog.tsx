import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, ShieldCheck } from 'lucide-react';

type TipoCambio = 'renombrar' | 'trazado' | 'geocercas' | 'precio' | 'otro';

interface MaestraLite {
  id: string;
  nombre: string;
  route_origin_lat: number | null;
  route_origin_lng: number | null;
  route_destination_lat: number | null;
  route_destination_lng: number | null;
  route_geofence_radius_m: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maestra: MaestraLite | null;
  onSubmitted?: () => void;
}

export default function SolicitarCambioRutaDialog({ open, onOpenChange, maestra, onSubmitted }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState<TipoCambio>('renombrar');
  const [motivo, setMotivo] = useState('');

  // Propuesta por tipo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [descTrazado, setDescTrazado] = useState('');
  const [oLat, setOLat] = useState('');
  const [oLng, setOLng] = useState('');
  const [dLat, setDLat] = useState('');
  const [dLng, setDLng] = useState('');
  const [radio, setRadio] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');

  // Evidencia auto-adjunta
  const [evidencia, setEvidencia] = useState<{ nombre?: string; qard?: string; telefono?: string } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setTipo('renombrar');
    setMotivo('');
    setNuevoNombre(maestra?.nombre ?? '');
    setDescTrazado('');
    setOLat(maestra?.route_origin_lat?.toString() ?? '');
    setOLng(maestra?.route_origin_lng?.toString() ?? '');
    setDLat(maestra?.route_destination_lat?.toString() ?? '');
    setDLng(maestra?.route_destination_lng?.toString() ?? '');
    setRadio(maestra?.route_geofence_radius_m?.toString() ?? '150');
    setNuevoPrecio('');

    supabase
      .from('profiles')
      .select('nombre, apodo, qard_number, phone, telefono')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEvidencia({
            nombre: (data as any).apodo || (data as any).nombre,
            qard: (data as any).qard_number,
            telefono: (data as any).phone || (data as any).telefono,
          });
        }
      });
  }, [open, user, maestra]);

  const handleSubmit = async () => {
    if (!user || !maestra) return;
    if (!motivo.trim()) {
      toast({ title: 'Falta el motivo', description: 'Explica por qué necesitas el cambio.', variant: 'destructive' });
      return;
    }

    const propuesta: Record<string, unknown> = {};
    if (tipo === 'renombrar') {
      if (!nuevoNombre.trim()) return toast({ title: 'Escribe el nuevo nombre', variant: 'destructive' });
      propuesta.nombre = nuevoNombre.trim();
    } else if (tipo === 'trazado') {
      if (!descTrazado.trim()) return toast({ title: 'Describe el tramo que cambia', variant: 'destructive' });
      propuesta.descripcion = descTrazado.trim();
    } else if (tipo === 'geocercas') {
      propuesta.origin_lat = parseFloat(oLat);
      propuesta.origin_lng = parseFloat(oLng);
      propuesta.destination_lat = parseFloat(dLat);
      propuesta.destination_lng = parseFloat(dLng);
      propuesta.radius_m = parseInt(radio || '150', 10);
    } else if (tipo === 'precio') {
      const p = parseFloat(nuevoPrecio);
      if (!(p > 0)) return toast({ title: 'Precio inválido', variant: 'destructive' });
      propuesta.precio = p;
    }

    setBusy(true);
    const { error } = await supabase.from('ruta_maestra_solicitudes' as any).insert({
      ruta_maestra_id: maestra.id,
      solicitante_user_id: user.id,
      tipo_cambio: tipo,
      propuesta,
      motivo: motivo.trim(),
    });
    setBusy(false);

    if (error) {
      toast({ title: 'No se pudo enviar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Solicitud enviada',
      description: 'El administrador la revisará. Te avisamos por bandeja interna cuando responda.',
    });
    onOpenChange(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar cambio a "{maestra?.nombre}"</DialogTitle>
          <DialogDescription>
            Todo cambio a una ruta maestra requiere aprobación del administrador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo de cambio</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCambio)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="renombrar">Renombrar ruta</SelectItem>
                <SelectItem value="trazado">Cambiar trazado / desvío de tramo</SelectItem>
                <SelectItem value="geocercas">Ajustar geocercas A y B</SelectItem>
                <SelectItem value="precio">Cambio de precio</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === 'renombrar' && (
            <div>
              <Label className="text-xs">Nuevo nombre</Label>
              <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
            </div>
          )}

          {tipo === 'trazado' && (
            <div>
              <Label className="text-xs">Describe el tramo que cambia</Label>
              <Textarea
                rows={4}
                value={descTrazado}
                onChange={(e) => setDescTrazado(e.target.value)}
                placeholder="Ej: A partir del km 12 se desvía por la carretera vieja hasta el entronque con la 15."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Al aprobar, el administrador vuelve a dibujar el trazado a mano en el mapa.
              </p>
            </div>
          )}

          {tipo === 'geocercas' && (
            <div className="space-y-2 rounded-md border p-2 bg-muted/40">
              <p className="text-[11px] text-muted-foreground">Actual precargado. Modifica lo que necesites.</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">A lat</Label><Input value={oLat} onChange={(e) => setOLat(e.target.value)} /></div>
                <div><Label className="text-[10px]">A lng</Label><Input value={oLng} onChange={(e) => setOLng(e.target.value)} /></div>
                <div><Label className="text-[10px]">B lat</Label><Input value={dLat} onChange={(e) => setDLat(e.target.value)} /></div>
                <div><Label className="text-[10px]">B lng</Label><Input value={dLng} onChange={(e) => setDLng(e.target.value)} /></div>
              </div>
              <div><Label className="text-[10px]">Radio (m)</Label><Input type="number" value={radio} onChange={(e) => setRadio(e.target.value)} /></div>
            </div>
          )}

          {tipo === 'precio' && (
            <div>
              <Label className="text-xs">Nuevo precio (MXN)</Label>
              <Input type="number" step="0.01" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} />
            </div>
          )}

          <div>
            <Label className="text-xs">Motivo (obligatorio)</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explica el porqué del cambio."
              maxLength={1000}
            />
          </div>

          <div className="rounded-md border bg-emerald-50 p-2 text-[11px] space-y-1">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              <ShieldCheck className="h-3 w-3" /> Evidencia auto-adjunta
            </div>
            <div>Concesionario: <strong>{evidencia?.nombre || '—'}</strong></div>
            <div>QaRd: <strong>{evidencia?.qard || '—'}</strong></div>
            <div>Teléfono: <strong>{evidencia?.telefono || '—'}</strong></div>
            <div className="text-emerald-700 pt-1">Estos datos quedan guardados como comprobante de tu solicitud.</div>
          </div>

          <Button onClick={handleSubmit} disabled={busy || !motivo.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar solicitud al administrador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
