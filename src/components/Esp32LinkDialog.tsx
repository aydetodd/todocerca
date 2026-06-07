import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Cpu, Trash2, Bluetooth, CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Esp32WifiProvisioner from './Esp32WifiProvisioner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string | null;
  unitName?: string;
  onSaved?: () => void;
}

export default function Esp32LinkDialog({ open, onOpenChange, unitId, unitName, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [hasMac, setHasMac] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !unitId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('unidades_empresa')
          .select('esp32_mac, esp32_secret, esp32_last_seen')
          .eq('id', unitId)
          .maybeSingle();
        if (error) throw error;
        const d = data as any;
        setHasSecret(!!d?.esp32_secret);
        setHasMac(!!d?.esp32_mac);
        setLastSeen((d?.esp32_last_seen as string) || null);
      } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, unitId, toast]);

  const handleUnlink = async () => {
    if (!unitId) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .update({ esp32_mac: null, esp32_secret: null })
        .eq('id', unitId);
      if (error) throw error;
      setHasSecret(false);
      setHasMac(false);
      setLastSeen(null);
      toast({ title: 'Desvinculado', description: 'Esta unidad ya no tiene módulo asociado.' });
      onSaved?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setUnlinking(false);
    }
  };

  const online = lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" /> Contador de pasajeros
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : 'Módulo ESP32'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Estado del módulo */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Estado del módulo</span>
              {hasMac ? (
                online ? (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <Circle className="h-3 w-3 mr-1" /> Sin reportar
                  </Badge>
                )
              ) : hasSecret ? (
                <Badge variant="outline">Esperando primer envío</Badge>
              ) : (
                <Badge variant="outline">Sin vincular</Badge>
              )}
            </div>

            {/* Instrucciones simples */}
            <Alert>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  <strong>¿Cómo se vincula un ESP32 a esta unidad?</strong>
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Compra el módulo ESP32 con firmware TodoCerca ya cargado (te lo enviamos listo para usar).</li>
                  <li>Enchúfalo a los 12V del camión.</li>
                  <li>Prende tu hotspot (2.4 GHz) en tu celular.</li>
                  <li>
                    Presiona <strong>"Conectar contador"</strong> aquí abajo y llena SSID + contraseña.
                  </li>
                  <li>El celular detecta el ESP32 por Bluetooth y le manda todo lo necesario. LED fijo = listo.</li>
                </ol>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  No necesitas tocar código ni programar el módulo. Cada unidad recibe su propia
                  identidad automáticamente la primera vez que la conectas.
                </p>
              </AlertDescription>
            </Alert>

            {/* Acción principal */}
            {unitId && (
              <div className="flex flex-col gap-2">
                <Esp32WifiProvisioner unidadId={unitId} unitLabel={unitName} />

                {(hasMac || hasSecret) && (
                  <Button
                    variant="outline"
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="text-destructive"
                    size="sm"
                  >
                    {unlinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" /> Desvincular módulo
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Bluetooth className="h-3 w-3" />
              Necesitas Chrome para Android o la app instalada para usar Bluetooth.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
