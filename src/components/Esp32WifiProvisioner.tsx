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

// Mismo UUID que el firmware del ESP32
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

type Step = 'idle' | 'fetching' | 'scanning' | 'connecting' | 'sending' | 'success' | 'error';

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
        'Tu navegador no soporta Bluetooth Web. Abre la app en Chrome Android o usa la app nativa.',
      );
      return;
    }

    try {
      setStep('fetching');
      const { data, error } = await supabase
        .from('unidades_empresa')
        .select('esp32_secret')
        .eq('id', unidadId)
        .maybeSingle();
      if (error) throw error;
      const secret = (data as any)?.esp32_secret;
      if (!secret) {
        throw new Error('Esta unidad no tiene un ESP32 vinculado. Pide al admin que lo configure.');
      }

      setStep('scanning');
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE_UUID] }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      setStep('connecting');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);

      setStep('sending');
      const payload = JSON.stringify({ ssid: ssid.trim(), pass, secret });
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
                1. Prende tu hotspot (2.4 GHz). 2. Llena los datos. 3. Presiona "Enviar al módulo".
                Tu celular detectará el ESP32 por Bluetooth.
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
                Este navegador no soporta Bluetooth Web. Usa Chrome en Android.
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
                    {step === 'fetching' && 'Cargando secreto…'}
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
