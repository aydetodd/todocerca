import { useState } from 'react';
import { Printer, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface OrderPrintButtonProps {
  onPrint: (copies: number) => Promise<void>;
  disabled?: boolean;
  isPrinting?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
}

export const OrderPrintButton = ({
  onPrint,
  disabled = false,
  isPrinting = false,
  variant = 'default',
}: OrderPrintButtonProps) => {
  const [copies, setCopies] = useState(1);
  const [isOpen, setIsOpen] = useState(false);

  const handlePrint = async () => {
    await onPrint(copies);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          disabled={disabled || isPrinting}
        >
          <Printer className="h-4 w-4 mr-2" />
          {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Imprimir Apartado</DialogTitle>
          <DialogDescription>
            ¿Cuántas copias deseas imprimir?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="copies">Número de copias</Label>
            <Input
              id="copies"
              type="number"
              min={1}
              max={5}
              value={copies}
              onChange={(e) => setCopies(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Copy className="h-4 w-4" />
            <p>
              Ejemplo: 1 para cocina, 1 para caja, 1 para cliente
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting} className="flex-1">
            <Printer className="h-4 w-4 mr-2" />
            {isPrinting ? 'Imprimiendo...' : `Imprimir ${copies > 1 ? `(${copies})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
