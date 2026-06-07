import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bluetooth, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  unidadId: string;
  unitLabel?: string;
}

// Mismo UUID que el firmware genérico del ESP32
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Endpoint único para todos los módulos del mundo. El firmware genérico
// no lo conoce: se lo mandamos por Bluetooth la primera vez junto con el secreto.
const ENDPOINT =
  'https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/esp32-conteo-pasajeros';

type Step = 'idle' | 'fetching' | 'scanning' | 'connecting' | 'sending' | 'success' | 'error';

function genSecret() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function Esp32WifiProvisioner({ unidadId, unitLabel }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const supported = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;

  const provision = async () => {
    setErrorMsg('');
    if (!ssid.trim()) {
      toast({ title: 'Falta el nombre del hotspot', variant: 'destructive' });
      return;
    }
    if (pass.length < 8) {
      toast({ title: 'La contraseña debe tener al menos 8 caracteres', variant: 'destructive' });
      return;
    }
    if (!supported) {
      setStep('error');
      setErrorMsg(
        'Tu navegador no soporta Bluetooth. Abre la app en Chrome para Android o en la app instalada.',
      );
      return;
    }

    try {
      setStep('fetching');

      // 1) Leer el secreto guardado de la unidad. Si no existe, generarlo
      //    automáticamente — el concesionario no necesita pedirlo a nadie.
      const { data, error } = await supabase
        .from('unidades_empresa')
        .select('esp32_secret')
        .eq('id', unidadId)
        .maybeSingle();
      if (error) throw error;

      let secret = (data as any)?.esp32_secret as string | null;
      if (!secret) {
        secret = genSecret();
        const { error: upErr } = await supabase
          .from('unidades_empresa')
          .update({ esp32_secret: secret } as any)
          .eq('id', unidadId);
        if (upErr) throw upErr;
      }

      // 2) Bluetooth
      setStep('scanning');
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE_UUID] }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      setStep('connecting');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);

      // 3) Mandar TODO lo que el módulo necesita: endpoint + secreto + WiFi.
      //    Así el firmware sale 100% genérico de fábrica.
      setStep('sending');
      const payload = JSON.stringify({
        endpoint: ENDPOINT,
        secret,
        ssid: ssid.trim(),
        pass,
      });
      const encoder = new TextEncoder();
      await characteristic.writeValue(encoder.encode(payload));

      try {
        device.gatt.disconnect();
      } catch {}

      setStep('success');
      toast({
        title: 'Listo',
        description: 'El módulo se está conectando al hotspot. El LED quedará fijo.',
      });
    } catch (e: any) {
      console.error('[BLE] error', e);
      setStep('error');
      setErrorMsg(e.message || 'No se pudo enviar la configuración al módulo.');
    }
  };

  const reset = () => {
    setStep('idle');
    setErrorMsg('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
          <Bluetooth className="h-3 w-3 mr-1 text-blue-500" />
          Conectar contador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5 text-blue-500" /> Conectar contador
          </DialogTitle>
          <DialogDescription>
            {unitLabel ? `Unidad: ${unitLabel}` : 'Envía tu hotspot al módulo ESP32 por Bluetooth.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'success' ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm text-center">
              Datos enviados. El LED del módulo quedará fijo cuando se conecte al hotspot.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full mt-2">
              Listo
            </Button>
          </div>
        ) : step === 'error' ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-center text-destructive">{errorMsg}</p>
            <Button onClick={reset} variant="outline" className="w-full mt-2">
              Intentar de nuevo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert>
              <AlertDescription className="text-xs">
                1. Enchufa el ESP32 al camión (12V). 2. Prende tu hotspot (2.4 GHz).
                3. Llena los datos y presiona "Enviar al módulo". El celular detectará
                el ESP32 por Bluetooth y le mandará todo lo necesario.
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label className="text-xs">Nombre del hotspot (SSID)</Label>
              <Input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                placeholder="Ej: MiHotspot"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={step !== 'idle'}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Contraseña del hotspot</Label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={step !== 'idle'}
              />
            </div>

            {!supported && (
              <p className="text-[11px] text-destructive">
                Este navegador no soporta Bluetooth. Usa Chrome en Android o la app instalada.
              </p>
            )}

            <DialogFooter>
              <Button onClick={provision} disabled={step !== 'idle' || !supported} className="w-full">
                {step === 'idle' ? (
                  <>
                    <Bluetooth className="h-4 w-4 mr-2" />
                    Enviar al módulo
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {step === 'fetching' && 'Preparando…'}
                    {step === 'scanning' && 'Buscando módulo…'}
                    {step === 'connecting' && 'Conectando…'}
                    {step === 'sending' && 'Enviando…'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
