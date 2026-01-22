import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { 
  ClipboardList, 
  User, 
  Phone, 
  Clock, 
  Package,
  Printer,
  CreditCard,
  ChefHat,
  PackageCheck,
  Download,
  RotateCcw,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  exported_at?: string | null;
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

// Función para reproducir alerta de sonido fuerte para nuevos pedidos
const playOrderAlertSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
      
      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };
    
    // Secuencia de tonos de alerta (repetir 3 veces)
    for (let i = 0; i < 3; i++) {
      const offset = i * 0.6;
      playTone(600, offset, 0.15);
      playTone(900, offset + 0.15, 0.15);
      playTone(600, offset + 0.3, 0.15);
      playTone(900, offset + 0.45, 0.15);
    }
    
    // Vibrar si está disponible
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200, 100, 400]);
    }
  } catch (error) {
    console.error('Error reproduciendo sonido de alerta:', error);
  }
};

export const OrdersManagement = ({ proveedorId, proveedorNombre }: OrdersManagementProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    loadOrders();
    
    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel('pedidos-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pedidos',
          filter: `proveedor_id=eq.${proveedorId}`,
        },
        (payload) => {
          // Nuevo pedido recibido - reproducir alerta
          console.log('🔔 Nuevo pedido recibido:', payload);
          playOrderAlertSound();
          toast({
            title: '🛒 ¡Nuevo Pedido!',
            description: 'Tienes un nuevo pedido pendiente',
          });
          loadOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
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
      console.error('Error cargando apartados:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los apartados',
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
        description: `El apartado ahora está ${estadoLabels[newStatus as keyof typeof estadoLabels].toLowerCase()}`,
      });
    } catch (error: any) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del apartado',
        variant: 'destructive',
      });
    }
  };

  const updateOrderStep = async (orderId: string, step: 'impreso' | 'pagado' | 'preparado' | 'entregado', value: boolean) => {
    try {
      // Obtener el pedido actual
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      // NO PERMITIR DESMARCAR - una vez verde, siempre verde
      if (!value) {
        toast({
          title: 'No se puede regresar',
          description: 'Una vez completado un paso, no se puede desmarcar',
          variant: 'destructive',
        });
        return;
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
        description: `El apartado ha sido marcado como ${stepLabels[step]}`,
      });
    } catch (error: any) {
      console.error('Error actualizando paso:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del apartado',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cargando apartados...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const impresosCount = orders.filter(o => o.impreso).length;
  const pagadosCount = orders.filter(o => o.pagado).length;
  const preparadosCount = orders.filter(o => o.preparado).length;
  const entregadosCount = orders.filter(o => o.entregado).length;
  const newOrdersCount = orders.filter(o => !o.exported_at).length;

  const handleExportToCSV = async () => {
    // Solo exportar registros que no han sido exportados
    const ordersToExport = orders.filter(o => !o.exported_at);
    
    if (ordersToExport.length === 0) {
      toast({
        title: 'Sin registros nuevos',
        description: 'No hay apartados nuevos para exportar',
        variant: 'destructive',
      });
      return;
    }

    const csvContent = [
      ['Número Orden', 'Cliente', 'Teléfono', 'Fecha', 'Hora', 'Total', 'Estado', 'Impreso', 'Pagado', 'Preparado', 'Entregado', 'Productos'],
      ...ordersToExport.map(order => [
        order.numero_orden,
        order.cliente_nombre,
        order.cliente_telefono,
        new Date(order.created_at).toLocaleDateString('es-MX'),
        new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        order.total,
        order.estado,
        order.impreso ? 'Sí' : 'No',
        order.pagado ? 'Sí' : 'No',
        order.preparado ? 'Sí' : 'No',
        order.entregado ? 'Sí' : 'No',
        order.items_pedido.map(item => `${item.cantidad}x ${item.productos.nombre}`).join('; ')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateTime = `${now.toISOString().split('T')[0]}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    link.setAttribute('href', url);
    link.setAttribute('download', `apartados-${proveedorNombre}-${dateTime}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Marcar los registros exportados con la fecha actual
    try {
      const orderIds = ordersToExport.map(o => o.id);
      const { error } = await supabase
        .from('pedidos')
        .update({ exported_at: new Date().toISOString() })
        .in('id', orderIds);

      if (error) throw error;

      // Actualizar el estado local para reflejar la marca de exportación
      setOrders(prev => 
        prev.map(order => 
          orderIds.includes(order.id) 
            ? { ...order, exported_at: new Date().toISOString() }
            : order
        )
      );

      toast({
        title: 'Exportación exitosa',
        description: `${ordersToExport.length} apartados exportados y marcados`,
      });
    } catch (error: any) {
      console.error('Error marcando apartados:', error);
      toast({
        title: 'CSV exportado',
        description: 'El CSV se exportó pero hubo un error al marcar los registros',
        variant: 'destructive',
      });
    }
  };

  const handleResetOrders = async () => {
    try {
      // Eliminar todos los pedidos del proveedor
      const { error: deleteError } = await supabase
        .from('pedidos')
        .delete()
        .eq('proveedor_id', proveedorId);

      if (deleteError) throw deleteError;

      // Resetear el sequence del número de orden
      const { error } = await supabase.rpc('reset_order_sequence', {
        proveedor_id_param: proveedorId
      });

      if (error) throw error;

      // Limpiar la pantalla inmediatamente
      setOrders([]);

      toast({
        title: 'Apartados eliminados',
        description: 'Todos los apartados han sido eliminados y el contador reiniciado a 1',
      });
    } catch (error: any) {
      console.error('Error reseteando apartados:', error);
      toast({
        title: 'Error',
        description: 'No se pudo resetear los apartados',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Gestión de Apartados
              </CardTitle>
              <CardDescription>
                {orders.length} {orders.length === 1 ? 'apartado total' : 'apartados totales'} • {newOrdersCount} nuevo{newOrdersCount !== 1 && 's'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Exportar apartados nuevos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se exportarán {newOrdersCount} apartados nuevos a un archivo CSV.
                      Los registros serán marcados como exportados y no aparecerán en futuras exportaciones.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleExportToCSV}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={newOrdersCount === 0}
                    >
                      Exportar ({newOrdersCount})
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 text-destructive hover:text-destructive"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Resetear Contador
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción eliminará TODOS los apartados y reiniciará el contador a 1. 
                      Te recomendamos exportar los apartados actuales antes de continuar.
                      Esta acción NO se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetOrders}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Resetear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className="bg-orange-500 text-white hover:bg-orange-600">
              {newOrdersCount} Nuevo{newOrdersCount !== 1 && 's'}
            </Badge>
            <Badge className="bg-amber-500 text-white hover:bg-amber-600">
              {impresosCount} Impreso{impresosCount !== 1 && 's'}
            </Badge>
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">
              {pagadosCount} Pagado{pagadosCount !== 1 && 's'}
            </Badge>
            <Badge className="bg-sky-500 text-white hover:bg-sky-600">
              {preparadosCount} Preparado{preparadosCount !== 1 && 's'}
            </Badge>
            <Badge className="bg-violet-500 text-white hover:bg-violet-600">
              {entregadosCount} Entregado{entregadosCount !== 1 && 's'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
            <p className="text-muted-foreground">No hay apartados aún</p>
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
                        disabled={order.impreso}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.impreso 
                            ? 'bg-emerald-500 border-emerald-600 text-white cursor-not-allowed' 
                            : 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'impreso', !order.impreso)}
                      >
                        <Printer className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          Impreso
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={order.pagado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.pagado 
                            ? 'bg-emerald-500 border-emerald-600 text-white cursor-not-allowed' 
                            : 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'pagado', !order.pagado)}
                      >
                        <CreditCard className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          Pagado
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={order.preparado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.preparado 
                            ? 'bg-emerald-500 border-emerald-600 text-white cursor-not-allowed' 
                            : 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'preparado', !order.preparado)}
                      >
                        <ChefHat className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          Preparado
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={order.entregado}
                        className={`flex items-center justify-center gap-2 h-auto py-2 ${
                          order.entregado 
                            ? 'bg-emerald-500 border-emerald-600 text-white cursor-not-allowed' 
                            : 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                        }`}
                        onClick={() => updateOrderStep(order.id, 'entregado', !order.entregado)}
                      >
                        <PackageCheck className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          Entregado
                        </span>
                      </Button>
                    </div>

                    {/* Información del pedido */}
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Apartado #{order.numero_orden}
                        {order.exported_at && (
                          <Badge variant="secondary" className="text-xs bg-gray-500 text-white">
                            Exportado
                          </Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {order.cliente_nombre}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-foreground">
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
                      <h4 className="font-semibold text-sm mb-3">Detalle del Apartado:</h4>
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
                        <span>TOTAL DEL APARTADO:</span>
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
