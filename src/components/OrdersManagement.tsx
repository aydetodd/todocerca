import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useThermalPrinter } from '@/hooks/useThermalPrinter';
import { ThermalPrinterControl } from '@/components/ThermalPrinterControl';
import { OrderPrintButton } from '@/components/OrderPrintButton';
import { formatCurrency } from '@/lib/utils';
import { 
  ClipboardList, 
  User, 
  Phone, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Package,
  Printer,
  CreditCard,
  ChefHat,
  PackageCheck
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OrderItem {
  id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  person_index?: number;
  productos: {
    nombre: string;
    unit: string;
  };
}

interface Order {
  id: string;
  numero_orden: number;
  cliente_nombre: string;
  cliente_telefono: string;
  total: number;
  estado: string;
  notas: string | null;
  created_at: string;
  items_pedido: OrderItem[];
  impreso?: boolean;
  pagado?: boolean;
  preparado?: boolean;
  entregado?: boolean;
}

interface OrdersManagementProps {
  proveedorId: string;
  proveedorNombre: string;
}

const estadoColors = {
  pendiente: 'bg-yellow-500',
  en_preparacion: 'bg-blue-500',
  listo: 'bg-green-500',
  entregado: 'bg-gray-500',
  cancelado: 'bg-red-500',
};

const estadoLabels = {
  pendiente: 'Pendiente',
  en_preparacion: 'En Preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const OrdersManagement = ({ proveedorId, proveedorNombre }: OrdersManagementProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const {
    isConnected,
    isConnecting,
    isPrinting,
    printer,
    connectToPrinter,
    disconnectPrinter,
    printReceipt,
  } = useThermalPrinter();

  useEffect(() => {
    loadOrders();
    
    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel('pedidos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
          filter: `proveedor_id=eq.${proveedorId}`,
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proveedorId]);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          items_pedido (
            id,
            cantidad,
            precio_unitario,
            subtotal,
            person_index,
            productos (
              nombre,
              unit
            )
          )
        `)
        .eq('proveedor_id', proveedorId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Error cargando pedidos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los pedidos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Estado actualizado',
        description: `El pedido ahora está ${estadoLabels[newStatus as keyof typeof estadoLabels].toLowerCase()}`,
      });
    } catch (error: any) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del pedido',
        variant: 'destructive',
      });
    }
  };

  const updateOrderStep = async (orderId: string, step: 'impreso' | 'pagado' | 'preparado' | 'entregado', value: boolean) => {
    try {
      // Obtener el pedido actual
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      // Validar la secuencia lógica si se está activando (value = true)
      if (value) {
        if (step === 'pagado' && !order.impreso) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes marcar el pedido como "Impreso" primero',
            variant: 'destructive',
          });
          return;
        }
        if (step === 'preparado' && !order.pagado) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes marcar el pedido como "Pagado" primero',
            variant: 'destructive',
          });
          return;
        }
        if (step === 'entregado' && !order.preparado) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes marcar el pedido como "Preparado" primero',
            variant: 'destructive',
          });
          return;
        }
      }

      // Validar al desactivar: no se puede desactivar si hay pasos posteriores activos
      if (!value) {
        if (step === 'impreso' && (order.pagado || order.preparado || order.entregado)) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes desactivar los pasos posteriores primero',
            variant: 'destructive',
          });
          return;
        }
        if (step === 'pagado' && (order.preparado || order.entregado)) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes desactivar los pasos posteriores primero',
            variant: 'destructive',
          });
          return;
        }
        if (step === 'preparado' && order.entregado) {
          toast({
            title: 'Acción no permitida',
            description: 'Debes desactivar "Entregado" primero',
            variant: 'destructive',
          });
          return;
        }
      }

      const { error } = await supabase
        .from('pedidos')
        .update({ [step]: value })
        .eq('id', orderId);

      if (error) throw error;

      // Actualizar el estado local inmediatamente
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, [step]: value }
            : order
        )
      );

      const stepLabels = {
        impreso: 'impreso',
        pagado: 'pagado',
        preparado: 'preparado',
        entregado: 'entregado',
      };

      toast({
        title: 'Estado actualizado',
        description: `El pedido ha sido marcado como ${stepLabels[step]}`,
      });
    } catch (error: any) {
      console.error('Error actualizando paso:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del pedido',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cargando pedidos...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const impresosCount = orders.filter(o => o.impreso).length;
  const pagadosCount = orders.filter(o => o.pagado).length;
  const preparadosCount = orders.filter(o => o.preparado).length;
  const entregadosCount = orders.filter(o => o.entregado).length;

  const handlePrintOrder = async (order: Order, copies: number) => {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-MX', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const hora = now.toLocaleTimeString('es-MX', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const items = order.items_pedido.map(item => ({
      personIndex: 0, // Por ahora todos en persona 0
      nombre: item.productos.nombre,
      cantidad: item.cantidad,
      unit: item.productos.unit,
      precio: item.precio_unitario,
    }));

    await printReceipt({
      numero_orden: order.numero_orden,
      fecha,
      hora,
      cliente_nombre: order.cliente_nombre,
      cliente_telefono: order.cliente_telefono,
      items,
      total: order.total,
      numPeople: 1,
      proveedorNombre,
    }, copies);
  };

  return (
    <div className="space-y-6">
      <ThermalPrinterControl
        isConnected={isConnected}
        isConnecting={isConnecting}
        printerName={printer?.device.name}
        onConnect={connectToPrinter}
        onDisconnect={disconnectPrinter}
      />
      
      <Card>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Gestión de Pedidos
            </CardTitle>
            <CardDescription>
              {orders.length} {orders.length === 1 ? 'pedido total' : 'pedidos totales'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-yellow-50">
              {impresosCount} Impreso{impresosCount !== 1 && 's'}
            </Badge>
            <Badge variant="outline" className="bg-green-50">
              {pagadosCount} Pagado{pagadosCount !== 1 && 's'}
            </Badge>
            <Badge variant="outline" className="bg-blue-50">
              {preparadosCount} Preparado{preparadosCount !== 1 && 's'}
            </Badge>
            <Badge variant="outline" className="bg-purple-50">
              {entregadosCount} Entregado{entregadosCount !== 1 && 's'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
            <p className="text-muted-foreground">No hay pedidos aún</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="border-l-4" style={{ borderLeftColor: estadoColors[order.estado as keyof typeof estadoColors] }}>
                  <CardHeader className="pb-3">
                    {/* Estados en fila horizontal */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.impreso 
                            ? 'bg-green-100 border-green-500 hover:bg-green-200' 
                            : 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'impreso', !order.impreso)}
                      >
                        <Printer className={`h-4 w-4 ${order.impreso ? 'text-green-600' : 'text-yellow-600'}`} />
                        <span className={`text-xs font-medium ${order.impreso ? 'text-green-700' : 'text-yellow-700'}`}>
                          Impreso
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!order.impreso && !order.pagado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.pagado 
                            ? 'bg-green-100 border-green-500 hover:bg-green-200' 
                            : !order.impreso 
                            ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                            : 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'pagado', !order.pagado)}
                      >
                        <CreditCard className={`h-4 w-4 ${order.pagado ? 'text-green-600' : !order.impreso ? 'text-gray-400' : 'text-yellow-600'}`} />
                        <span className={`text-xs font-medium ${order.pagado ? 'text-green-700' : !order.impreso ? 'text-gray-400' : 'text-yellow-700'}`}>
                          Pagado
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!order.pagado && !order.preparado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.preparado 
                            ? 'bg-green-100 border-green-500 hover:bg-green-200' 
                            : !order.pagado 
                            ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                            : 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'preparado', !order.preparado)}
                      >
                        <ChefHat className={`h-4 w-4 ${order.preparado ? 'text-green-600' : !order.pagado ? 'text-gray-400' : 'text-yellow-600'}`} />
                        <span className={`text-xs font-medium ${order.preparado ? 'text-green-700' : !order.pagado ? 'text-gray-400' : 'text-yellow-700'}`}>
                          Preparado
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!order.preparado && !order.entregado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.entregado 
                            ? 'bg-green-100 border-green-500 hover:bg-green-200' 
                            : !order.preparado 
                            ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                            : 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'entregado', !order.entregado)}
                      >
                        <PackageCheck className={`h-4 w-4 ${order.entregado ? 'text-green-600' : !order.preparado ? 'text-gray-400' : 'text-yellow-600'}`} />
                        <span className={`text-xs font-medium ${order.entregado ? 'text-green-700' : !order.preparado ? 'text-gray-400' : 'text-yellow-700'}`}>
                          Entregado
                        </span>
                      </Button>
                    </div>

                    {/* Información del pedido */}
                    <div>
                      <CardTitle className="text-lg">
                        Pedido #{order.numero_orden}
                      </CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {order.cliente_nombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {order.cliente_telefono}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(order.created_at).toLocaleString('es-MX')}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm mb-3">Detalle del Pedido:</h4>
                      {(() => {
                        // Agrupar items por persona
                        const itemsByPerson = order.items_pedido.reduce((acc, item) => {
                          const personIdx = item.person_index ?? 0;
                          if (!acc[personIdx]) acc[personIdx] = [];
                          acc[personIdx].push(item);
                          return acc;
                        }, {} as Record<number, OrderItem[]>);

                        const numPeople = Object.keys(itemsByPerson).length;

                        return (
                          <div className="space-y-4">
                            {Object.entries(itemsByPerson)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([personIndex, items]) => {
                                const personTotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
                                
                                return (
                                  <div key={personIndex} className="border-l-2 border-primary pl-3">
                                    {numPeople > 1 && (
                                      <div className="font-bold text-sm text-primary mb-2 flex items-center gap-2">
                                        <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">
                                          {Number(personIndex) + 1}
                                        </span>
                                        Persona {Number(personIndex) + 1}
                                      </div>
                                    )}
                                    <div className="space-y-1.5">
                                      {items.map((item, idx) => (
                                        <div key={item.id} className="flex justify-between text-sm p-2 rounded bg-background border">
                                          <span className="flex items-center gap-2">
                                            <span className="font-medium">{item.cantidad}</span>
                                            <span className="text-muted-foreground">×</span>
                                            <span>{item.productos.nombre}</span>
                                            <span className="text-xs text-muted-foreground">({item.productos.unit})</span>
                                          </span>
                                          <span className="font-medium">{formatCurrency(Number(item.subtotal))}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {numPeople > 1 && (
                                      <div className="flex justify-between text-sm mt-2 pt-2 border-t font-semibold">
                                        <span>Subtotal Persona {Number(personIndex) + 1}:</span>
                                        <span className="text-primary">{formatCurrency(personTotal)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })()}
                      <div className="flex justify-between pt-3 mt-3 border-t-2 border-primary font-bold text-base">
                        <span>TOTAL DEL PEDIDO:</span>
                        <span className="text-primary text-lg">{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
    </div>
  );
};
