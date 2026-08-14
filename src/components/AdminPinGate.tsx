import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';

const CLAVE_SESION = 'admin_pin_ok';

interface Props {
  children: React.ReactNode;
}

/**
 * Candado extra del panel de administrador.
 * Aunque alguien tenga el teléfono con la sesión abierta, sin el PIN de 6 dígitos
 * no puede entrar a autorizar nada. Se pide una vez por sesión del navegador.
 */
export function AdminPinGate({ children }: Props) {
  const [cargando, setCargando] = useState(true);
  const [tienePin, setTienePin] = useState(false);
  const [desbloqueado, setDesbloqueado] = useState(
    () => sessionStorage.getItem(CLAVE_SESION) === '1'
  );
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('admin_pin_estado' as any);
      setTienePin(Boolean(data));
      setCargando(false);
    })();
  }, []);

  const crearPin = async () => {
    setError('');
    if (!/^[0-9]{6}$/.test(pin)) return setError('El PIN debe tener 6 dígitos');
    if (pin !== pin2) return setError('Los dos PIN no son iguales');
    setEnviando(true);
    const { data, error: e } = await supabase.rpc('admin_pin_set' as any, { _pin: pin });
    setEnviando(false);
    const res = data as any;
    if (e || !res?.ok) return setError(res?.error || e?.message || 'No se pudo guardar el PIN');
    sessionStorage.setItem(CLAVE_SESION, '1');
    setDesbloqueado(true);
    setTienePin(true);
    setPin('');
    setPin2('');
  };

  const verificar = async () => {
    setError('');
    if (pin.length !== 6) return setError('Escribe tus 6 dígitos');
    setEnviando(true);
    const { data, error: e } = await supabase.rpc('admin_pin_verify' as any, { _pin: pin });
    setEnviando(false);
    const res = data as any;
    if (e || !res?.ok) {
      setPin('');
      return setError(res?.error || e?.message || 'PIN incorrecto');
    }
    sessionStorage.setItem(CLAVE_SESION, '1');
    setDesbloqueado(true);
    setPin('');
  };

  if (cargando) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (desbloqueado) return <>{children}</>;

  return (
    <div className="container mx-auto max-w-md px-4 py-8 pb-40">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            {tienePin ? <Lock className="w-7 h-7 text-primary" /> : <ShieldCheck className="w-7 h-7 text-primary" />}
          </div>
          <CardTitle>{tienePin ? 'Escribe tu PIN' : 'Crea tu PIN de administrador'}</CardTitle>
          <CardDescription>
            {tienePin
              ? 'Sin este PIN nadie puede entrar al panel, aunque tenga tu teléfono.'
              : 'Son 6 dígitos. Se pedirán cada vez que abras el panel en un dispositivo.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-pin">PIN de 6 dígitos</Label>
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tienePin) verificar();
              }}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
          </div>

          {!tienePin && (
            <div className="space-y-2">
              <Label htmlFor="admin-pin2">Repite el PIN</Label>
              <Input
                id="admin-pin2"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={enviando}
            onClick={tienePin ? verificar : crearPin}
          >
            {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {tienePin ? 'Entrar' : 'Guardar PIN'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
