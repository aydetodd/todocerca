import React, { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Extensión de tipos para Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: {
        filters?: Array<{ services?: string[] }>;
        optionalServices?: string[];
      }): Promise<any>;
    };
  }
}

interface PrinterDevice {
  device: any;
  characteristic: any;
}

export const useThermalPrinter = () => {
  const [printer, setPrinter] = useState<PrinterDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const { toast } = useToast();

  // Comandos ESC/POS para impresoras térmicas
  const ESC = '\x1B';
  const GS = '\x1D';
  
  const commands = {
    init: ESC + '@',
    alignCenter: ESC + 'a' + '\x01',
    alignLeft: ESC + 'a' + '\x00',
    alignRight: ESC + 'a' + '\x02',
    bold: ESC + 'E' + '\x01',
    boldOff: ESC + 'E' + '\x00',
    large: GS + '!' + '\x11',
    medium: GS + '!' + '\x01',
    normal: GS + '!' + '\x00',
    cut: GS + 'V' + '\x00',
    newLine: '\n',
    doubleLine: '\n\n',
  };

  const connectToPrinter = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Solicitar dispositivo Bluetooth
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Servicio común de impresoras
        ],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('No se pudo conectar al dispositivo');

      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      setPrinter({ device, characteristic });
      
      toast({
        title: '✅ Impresora conectada',
        description: `Conectado a ${device.name || 'impresora térmica'}`,
      });

      return true;
    } catch (error: any) {
      console.error('Error conectando impresora:', error);
      toast({
        title: 'Error de conexión',
        description: error.message || 'No se pudo conectar a la impresora',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnectPrinter = useCallback(() => {
    if (printer?.device.gatt?.connected) {
      printer.device.gatt.disconnect();
    }
    setPrinter(null);
    toast({
      title: 'Impresora desconectada',
    });
  }, [printer, toast]);

  const sendToPrinter = useCallback(async (data: string) => {
    if (!printer?.characteristic) {
      throw new Error('No hay impresora conectada');
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    
    // Enviar en chunks de 20 bytes (limitación Bluetooth)
    const chunkSize = 20;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await printer.characteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 50)); // Pequeña pausa entre chunks
    }
  }, [printer]);

  const printReceipt = useCallback(async (orderData: {
    numero_orden: number;
    fecha: string;
    hora: string;
    cliente_nombre: string;
    cliente_telefono: string;
    items: Array<{
      personIndex: number;
      nombre: string;
      cantidad: number;
      unit: string;
      precio: number;
    }>;
    total: number;
    numPeople: number;
    proveedorNombre: string;
  }, copies: number = 1) => {
    if (!printer?.characteristic) {
      toast({
        title: 'Sin impresora',
        description: 'Conecta una impresora térmica primero',
        variant: 'destructive',
      });
      return false;
    }

    setIsPrinting(true);
    try {
      for (let copy = 0; copy < copies; copy++) {
        let receipt = commands.init;
        
        // Encabezado
        receipt += commands.alignCenter;
        receipt += commands.large;
        receipt += orderData.proveedorNombre + commands.newLine;
        receipt += commands.normal;
        receipt += '================================' + commands.newLine;
        receipt += commands.medium;
        receipt += `PEDIDO #${orderData.numero_orden}` + commands.doubleLine;
        receipt += commands.normal;
        
        // Información del pedido
        receipt += commands.alignLeft;
        receipt += `Fecha: ${orderData.fecha}` + commands.newLine;
        receipt += `Hora: ${orderData.hora}` + commands.newLine;
        receipt += '--------------------------------' + commands.newLine;
        receipt += commands.bold;
        receipt += `Cliente: ${orderData.cliente_nombre}` + commands.newLine;
        receipt += commands.boldOff;
        receipt += `Tel: ${orderData.cliente_telefono}` + commands.doubleLine;
        
        // Items agrupados por persona
        const itemsByPerson = new Map<number, typeof orderData.items>();
        orderData.items.forEach(item => {
          if (!itemsByPerson.has(item.personIndex)) {
            itemsByPerson.set(item.personIndex, []);
          }
          itemsByPerson.get(item.personIndex)!.push(item);
        });

        itemsByPerson.forEach((items, personIndex) => {
          receipt += '--------------------------------' + commands.newLine;
          receipt += commands.bold;
          receipt += `PERSONA ${personIndex + 1}` + commands.newLine;
          receipt += commands.boldOff;
          receipt += '--------------------------------' + commands.newLine;
          
          items.forEach(item => {
            receipt += item.nombre + commands.newLine;
            const cantidad = `${item.cantidad} ${item.unit}`;
            const precio = `$${item.precio.toFixed(2)}`;
            const subtotal = `$${(item.cantidad * item.precio).toFixed(2)}`;
            const line = `  ${cantidad} x ${precio}`;
            const spaces = 32 - line.length - subtotal.length;
            receipt += line + ' '.repeat(Math.max(spaces, 1)) + subtotal + commands.newLine;
          });
          receipt += commands.newLine;
        });
        
        // Total
        receipt += '================================' + commands.newLine;
        receipt += commands.large;
        receipt += commands.bold;
        receipt += commands.alignRight;
        receipt += `TOTAL: $${orderData.total.toFixed(2)}` + commands.newLine;
        receipt += commands.normal;
        receipt += commands.boldOff;
        receipt += commands.alignCenter;
        receipt += '================================' + commands.doubleLine;
        
        // Pie
        receipt += commands.alignCenter;
        receipt += '¡Gracias por su pedido!' + commands.doubleLine;
        
        if (copies > 1) {
          receipt += `Copia ${copy + 1} de ${copies}` + commands.doubleLine;
        }
        
        // Cortar papel
        receipt += commands.newLine + commands.newLine + commands.newLine;
        receipt += commands.cut;
        
        await sendToPrinter(receipt);
        
        // Pausa entre copias
        if (copy < copies - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      toast({
        title: '✅ Impreso exitosamente',
        description: copies > 1 ? `${copies} copias impresas` : 'Ticket impreso',
      });
      return true;
    } catch (error: any) {
      console.error('Error imprimiendo:', error);
      toast({
        title: 'Error de impresión',
        description: error.message || 'No se pudo imprimir el ticket',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, [printer, sendToPrinter, toast, commands]);

  return {
    printer,
    isConnecting,
    isPrinting,
    isConnected: !!printer?.characteristic,
    connectToPrinter,
    disconnectPrinter,
    printReceipt,
  };
};
