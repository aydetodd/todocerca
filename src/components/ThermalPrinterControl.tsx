import { Printer, Bluetooth, BluetoothOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ThermalPrinterControlProps {
  isConnected: boolean;
  isConnecting: boolean;
  printerName?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const ThermalPrinterControl = ({
  isConnected,
  isConnecting,
  printerName,
  onConnect,
  onDisconnect,
}: ThermalPrinterControlProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            <CardTitle>Impresora Térmica</CardTitle>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Conectada' : 'Desconectada'}
          </Badge>
        </div>
        <CardDescription>
          Conecta tu impresora térmica Bluetooth para imprimir apartados
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Bluetooth className="h-4 w-4 text-primary" />
              <span className="font-medium">{printerName || 'Impresora conectada'}</span>
            </div>
            <Button
              variant="outline"
              onClick={onDisconnect}
              className="w-full"
            >
              <BluetoothOff className="h-4 w-4 mr-2" />
              Desconectar
            </Button>
          </div>
        ) : (
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full"
          >
            <Bluetooth className="h-4 w-4 mr-2" />
            {isConnecting ? 'Conectando...' : 'Conectar Impresora'}
          </Button>
        )}
        
        {!isConnected && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-xs space-y-1">
            <p className="font-medium">💡 Requisitos:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Impresora térmica Bluetooth encendida</li>
              <li>Bluetooth activado en tu dispositivo</li>
              <li>Compatible con Android (Chrome/Edge)</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
