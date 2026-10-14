import { useEffect, useState } from 'react';
import { Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDataBytes, getDataUsage, subscribeDataUsage } from '@/lib/dataUsage';

export default function DataUsageDialog() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState(getDataUsage);
  useEffect(() => {
    if (!open) return;
    const update = () => setUsage(getDataUsage());
    update();
    const unsubscribe = subscribeDataUsage(update);
    const timer = window.setInterval(update, 10_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-28 h-auto flex-col gap-2 p-4" title="Consumo de datos">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wifi className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="font-semibold">Consumo de datos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 tracking-normal">Consumo de datos</DialogTitle>
          <DialogDescription>Estimación de TodoCerca en este teléfono y navegador.</DialogDescription>
        </DialogHeader>
        {usage.supported ? (
          <dl className="divide-y divide-border" aria-live="polite">
            <div className="flex items-center justify-between gap-4 py-5">
              <dt className="text-muted-foreground">Hoy</dt>
              <dd className="text-2xl font-semibold tabular-nums text-primary">{formatDataBytes(usage.daily)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-5">
              <dt className="text-muted-foreground">Este mes</dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatDataBytes(usage.monthly)}</dd>
            </div>
          </dl>
        ) : <p className="text-sm text-muted-foreground">Este navegador no permite medir las descargas.</p>}
        <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>Registro desde el {usage.startedOn.split('-').reverse().join('/')}. Día y mes según la hora de Sonora.</p>
          <p>Incluye descargas que el navegador permite medir, tanto por Wi-Fi como por datos móviles. No distingue entre ambos.</p>
          <p>No incluye envíos, mensajes en tiempo real ni algunas descargas de mapas. Puede ser menor que el consumo real; no es el contador de tu compañía telefónica.</p>
          {usage.unavailable > 0 && <p>{usage.unavailable.toLocaleString('es-MX')} descargas sin tamaño disponible este mes.</p>}
          {!usage.storageAvailable && <p className="text-destructive">Este navegador no permite guardar el contador; los datos pueden perderse al cerrar.</p>}
          <p>Si borras los datos del navegador, este registro se pierde.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}