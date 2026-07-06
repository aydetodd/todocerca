import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
  const [evidencia, setEvidencia] = useState<{ nombre?: string; qard?: string; telefono?: string } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setTipo('renombrar');
    setMotivo('');
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
  }, [open, user]);

  const handleSubmit = async () => {
    if (!user || !maestra) return;
    if (!motivo.trim()) {
      toast({ title: 'Falta el motivo', description: 'Explica por qué necesitas el cambio.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('ruta_maestra_solicitudes' as any).insert({
      ruta_maestra_id: maestra.id,
      solicitante_user_id: user.id,
      tipo_cambio: tipo,
      propuesta: {},
      motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) {
      toast({ title: 'No se pudo enviar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Solicitud enviada',
      description: 'Cuando el administrador autorice, podrás editar la ruta tú mismo por 7 días.',
    });
    onOpenChange(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedir autorización para editar "{maestra?.nombre}"</DialogTitle>
          <DialogDescription>
            Solo pides permiso. Al aprobar, tú mismo editas la ruta directamente (nombre, trazado, geocercas) durante 7 días.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo de cambio que planeas hacer</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCambio)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="renombrar">Corregir/renombrar la ruta</SelectItem>
                <SelectItem value="trazado">Cambiar el trazado (dibujar de nuevo)</SelectItem>
                <SelectItem value="geocercas">Ajustar geocercas A y B</SelectItem>
                <SelectItem value="precio">Cambio de precio</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Motivo (obligatorio)</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: el nombre quedó 'Huatabampoo' con dos oes, hay que corregirlo."
              maxLength={1000}
            />
          </div>

          <div className="rounded-md border bg-emerald-50 p-2 text-[11px] space-y-1">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              <ShieldCheck className="h-3 w-3" /> Queda registro de quién solicitó
            </div>
            <div>Concesionario: <strong>{evidencia?.nombre || '—'}</strong></div>
            <div>QaRd: <strong>{evidencia?.qard || '—'}</strong></div>
            <div>Teléfono: <strong>{evidencia?.telefono || '—'}</strong></div>
          </div>

          <Button onClick={handleSubmit} disabled={busy || !motivo.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Pedir autorización al administrador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
