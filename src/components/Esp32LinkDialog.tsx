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
import { Copy, Loader2, RefreshCw, Cpu, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string | null;
  unitName?: string;
  onSaved?: () => void;
}

const MAC_REGEX = /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/;

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

  useEffect(() => {
    if (!open || !unitId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('unidades_empresa')
          .select('esp32_mac, esp32_secret')
          .eq('id', unitId)
          .maybeSingle();
        if (error) throw error;
        setMac((data?.esp32_mac as string) || '');
        setSecret((data?.esp32_secret as string) || '');
        setHasSavedMac(!!data?.esp32_mac);
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
      toast({ title: 'Copiado', description: `${label} copiado al portapapeles.` });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!unitId) return;
    const normalized = normalizeMac(mac);
    if (!MAC_REGEX.test(normalized)) {
      toast({
        title: 'MAC inválida',
        description: 'Usa el formato AA:BB:CC:DD:EE:FF',
        variant: 'destructive',
      });
      return;
    }
    const finalSecret = secret || genSecret();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('unidades_empresa')
        .update({ esp32_mac: normalized, esp32_secret: finalSecret })
        .eq('id', unitId);
      if (error) throw error;
      setMac(normalized);
      setSecret(finalSecret);
      setHasSavedMac(true);
      toast({ title: 'ESP32 vinculado', description: 'Ya puedes encender el dispositivo.' });
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
      setSecret('');
      setHasSavedMac(false);
      toast({ title: 'Desvinculado', description: 'La unidad ya no tiene ESP32.' });
      onSaved?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const endpoint = `https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/esp32-conteo-pasajeros`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" /> Vincular ESP32
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : 'Conecta el contador de pasajeros a esta unidad.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <AlertDescription className="text-xs">
                Al encender el ESP32 por primera vez, su MAC aparece en el monitor serial.
                Cópiala y pégala aquí. El secreto se genera automáticamente.
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label className="text-xs">MAC del ESP32</Label>
              <Input
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="font-mono text-sm"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Secreto compartido</Label>
              <div className="flex gap-1">
                <Input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Se generará al guardar"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSecret(genSecret())}
                  title="Generar nuevo secreto"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {secret && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copy(secret, 'Secreto')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Endpoint para el firmware</Label>
              <div className="flex gap-1">
                <Input value={endpoint} readOnly className="text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(endpoint, 'Endpoint')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                POST JSON: {`{ mac, secret, evento: "sube"|"baja", puerta: "frente"|"atras" }`}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : hasSavedMac ? 'Actualizar' : 'Guardar'}
              </Button>
              {hasSavedMac && (
                <Button
                  variant="outline"
                  onClick={handleUnlink}
                  disabled={saving}
                  className="text-destructive"
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
