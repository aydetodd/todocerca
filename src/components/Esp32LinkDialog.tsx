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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Loader2, RefreshCw, Cpu, Trash2, Bluetooth, CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string | null;
  unitName?: string;
  onSaved?: () => void;
}

const MAC_REGEX = /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/;
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

function normalizeMac(raw: string) {
  return raw.trim().toLowerCase().replace(/-/g, ':');
}

function genSecret() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function Esp32LinkDialog({ open, onOpenChange, unitId, unitName, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mac, setMac] = useState('');
  const [secret, setSecret] = useState('');
  const [hasSavedMac, setHasSavedMac] = useState(false);
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
        setMac((d?.esp32_mac as string) || '');
        setSecret((d?.esp32_secret as string) || genSecret());
        setLastSeen((d?.esp32_last_seen as string) || null);
        setHasSavedMac(!!d?.esp32_mac);
      } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, unitId, toast]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado', description: `${label} copiado.` });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!unitId) return;
    if (mac && !MAC_REGEX.test(normalizeMac(mac))) {
      toast({
        title: 'MAC inválida',
        description: 'Formato esperado: AA:BB:CC:DD:EE:FF (o déjala vacía para que se registre sola)',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .update({
          esp32_mac: mac ? normalizeMac(mac) : null,
          esp32_secret: secret,
        } as any)
        .eq('id', unitId);
      if (error) throw error;
      if (mac) setMac(normalizeMac(mac));
      setHasSavedMac(!!mac);
      toast({
        title: 'Listo',
        description: mac
          ? 'ESP32 vinculado. Ya puedes encender el módulo.'
          : 'Secreto guardado. La MAC se registrará sola al primer envío.',
      });
      onSaved?.();
    } catch (e: any) {
      toast({
        title: 'Error al guardar',
        description: e.message?.includes('duplicate')
          ? 'Esa MAC ya está vinculada a otra unidad.'
          : e.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!unitId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .update({ esp32_mac: null, esp32_secret: null })
        .eq('id', unitId);
      if (error) throw error;
      setMac('');
      setSecret(genSecret());
      setHasSavedMac(false);
      setLastSeen(null);
      toast({ title: 'Desvinculado' });
      onSaved?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const endpoint = `https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/esp32-conteo-pasajeros`;
  const online = lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" /> Vincular ESP32
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : 'Contador de pasajeros'}
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
              {hasSavedMac ? (
                online ? (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <Circle className="h-3 w-3 mr-1" /> Sin reportar
                  </Badge>
                )
              ) : (
                <Badge variant="outline">Sin vincular</Badge>
              )}
            </div>

            {/* Paso 1 */}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="text-xs font-semibold text-primary">
                Paso 1 · Programa el ESP32 (una sola vez)
              </div>
              <p className="text-xs text-muted-foreground">
                Copia el <strong>Endpoint</strong> y el <strong>Secreto</strong> en el firmware
                antes de soldar el módulo en el camión. Eso es todo lo que necesita el código.
              </p>

              <div className="space-y-1">
                <Label className="text-xs">Endpoint</Label>
                <div className="flex gap-1">
                  <Input value={endpoint} readOnly className="text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(endpoint, 'Endpoint')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Secreto compartido</Label>
                <div className="flex gap-1">
                  <Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSecret(genSecret())}
                    title="Generar nuevo"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(secret, 'Secreto')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1">
                <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
                Paso 2 · El chofer conecta el WiFi por Bluetooth
              </div>
              <p className="text-xs text-muted-foreground">
                El chofer NO necesita saber el SSID ni la contraseña de antemano. Cada vez que
                cambie de hotspot, hace esto:
              </p>
              <ol className="text-xs space-y-1 list-decimal pl-4 text-muted-foreground">
                <li>Prende el hotspot en su celular (2.4 GHz).</li>
                <li>Abre la app TodoCerca → su panel → botón <strong>"Conectar contador"</strong>.</li>
                <li>El celular detecta el ESP32 por Bluetooth y le envía SSID + contraseña.</li>
                <li>El LED del módulo queda fijo cuando se conecta. Listo.</li>
              </ol>
              <p className="text-[10px] text-muted-foreground pt-1">
                Service UUID BLE: <code className="text-[10px]">{BLE_SERVICE_UUID}</code>
              </p>
            </div>

            {/* Paso 3 */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold">Paso 3 · MAC del ESP32 (opcional)</div>
              <p className="text-xs text-muted-foreground">
                Si tienes la MAC anotada de la etiqueta, pégala aquí. Si no, déjala vacía: se
                registrará sola la primera vez que el módulo envíe un evento.
              </p>
              <Input
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF (opcional)"
                className="font-mono text-sm"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar configuración'}
              </Button>
              {hasSavedMac && (
                <Button
                  variant="outline"
                  onClick={handleUnlink}
                  disabled={saving}
                  className="text-destructive"
                  title="Desvincular"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
