import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Calendar, Clock, User, Phone, CheckCircle, XCircle, MessageCircle } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Appointment {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  servicio: string | null;
  notas: string | null;
  estado: string;
}

interface ProviderAppointmentsProps {
  proveedorId: string;
}

export function ProviderAppointments({ proveedorId }: ProviderAppointmentsProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const lastNotifiedIdRef = useRef<string | null>(null);

  const playNewAppointmentSound = () => {
    try {
      // Nota: en algunos navegadores requiere una interacción previa del usuario
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.06;

      o.connect(g);
      g.connect(ctx.destination);

      o.start();
      o.stop(ctx.currentTime + 0.16);

      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 350);
    } catch (e) {
      console.log('No se pudo reproducir sonido de notificación', e);
    }
  };

  useEffect(() => {
    loadAppointments();

    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel(`citas-changes-${proveedorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'citas',
          filter: `proveedor_id=eq.${proveedorId}`,
        },
        (payload) => {
          console.log('Realtime citas payload:', payload);

          if (payload.eventType === 'INSERT') {
            const newId = (payload as any).new?.id as string | undefined;
            if (newId && lastNotifiedIdRef.current !== newId) {
              lastNotifiedIdRef.current = newId;
              playNewAppointmentSound();
              toast({
                title: 'Nueva cita',
                description: 'Te acaban de agendar una nueva cita.',
              });
            }
          }

          loadAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proveedorId]);

  const loadAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('citas')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .order('fecha', { ascending: true })
        .order('hora_inicio', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las citas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, estado: string) => {
    try {
      const { error } = await supabase
        .from('citas')
        .update({ estado })
        .eq('id', id);

      if (error) throw error;

      let whatsappOk: boolean | null = null;
      if (estado === 'confirmada') {
        const { error: fnError } = await supabase.functions.invoke(
          'send-whatsapp-appointment-update',
          {
            body: { appointmentId: id, status: estado },
          }
        );

        whatsappOk = !fnError;
        if (fnError) {
          console.error('Error enviando WhatsApp al cliente:', fnError);
        }
      }

      toast({
        title: 'Estado actualizado',
        description:
          estado === 'confirmada'
            ? whatsappOk
              ? 'Cita confirmada y se notificó al cliente por WhatsApp.'
              : 'Cita confirmada (no se pudo enviar WhatsApp).'
            : `La cita ha sido marcada como ${estado}`,
      });

      loadAppointments();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'pendiente':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Pendiente</Badge>;
      case 'confirmada':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Confirmada</Badge>;
      case 'completada':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Completada</Badge>;
      case 'cancelada':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getDateLabel = (fecha: string) => {
    const date = parseISO(fecha);
    if (isToday(date)) return 'Hoy';
    if (isTomorrow(date)) return 'Mañana';
    return format(date, "EEEE d 'de' MMMM", { locale: es });
  };

  const contactWhatsApp = (telefono: string, nombre: string) => {
    const mensaje = `Hola ${nombre}, te contactamos respecto a tu cita.`;
    
    // Limpiar número y asegurar prefijo 52 para México
    let phoneClean = telefono.replace(/\D/g, '');
    if (phoneClean.length === 10) {
      phoneClean = '52' + phoneClean;
    } else if (phoneClean.startsWith('1') && phoneClean.length === 11) {
      phoneClean = '52' + phoneClean.slice(1);
    }
    
    const url = `https://wa.me/${phoneClean}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  const filterAppointments = (filter: 'upcoming' | 'past' | 'cancelled') => {
    const today = new Date().toISOString().split('T')[0];
    
    switch (filter) {
      case 'upcoming':
        return appointments.filter(a => a.fecha >= today && a.estado !== 'cancelada');
      case 'past':
        return appointments.filter(a => a.fecha < today || a.estado === 'completada');
      case 'cancelled':
        return appointments.filter(a => a.estado === 'cancelada');
      default:
        return appointments;
    }
  };

  if (loading) {
    return <div className="text-center py-4">Cargando citas...</div>;
  }

  const renderAppointmentCard = (apt: Appointment) => (
    <Card key={apt.id} className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{getDateLabel(apt.fecha)}</span>
              <Clock className="h-4 w-4 text-muted-foreground ml-2" />
              <span>{apt.hora_inicio.slice(0, 5)} - {apt.hora_fin.slice(0, 5)}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{apt.cliente_nombre}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{apt.cliente_telefono}</span>
            </div>

            {apt.servicio && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Servicio:</span> {apt.servicio}
              </p>
            )}

            {apt.notas && (
              <p className="text-sm text-muted-foreground mt-1">
                Notas: {apt.notas}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(apt.estado)}
          </div>
        </div>

        {apt.estado !== 'cancelada' && apt.estado !== 'completada' && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => contactWhatsApp(apt.cliente_telefono, apt.cliente_nombre)}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              WhatsApp
            </Button>
            
            {apt.estado === 'pendiente' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatus(apt.id, 'confirmada')}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirmar
              </Button>
            )}
            
            {apt.estado === 'confirmada' && (() => {
              // Solo mostrar "Completar" si la fecha/hora de la cita ya pasó
              const appointmentDateTime = new Date(`${apt.fecha}T${apt.hora_fin}`);
              const canComplete = appointmentDateTime <= new Date();
              
              return canComplete ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus(apt.id, 'completada')}
                  className="text-green-600"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Completar
                </Button>
              ) : null;
            })()}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus(apt.id, 'cancelada')}
              className="text-destructive"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Mis Citas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upcoming">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="upcoming" className="flex-1">
              Próximas ({filterAppointments('upcoming').length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1">
              Pasadas ({filterAppointments('past').length})
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="flex-1">
              Canceladas ({filterAppointments('cancelled').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {filterAppointments('upcoming').length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No tienes citas próximas
              </p>
            ) : (
              filterAppointments('upcoming').map(renderAppointmentCard)
            )}
          </TabsContent>

          <TabsContent value="past">
            {filterAppointments('past').length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay citas pasadas
              </p>
            ) : (
              filterAppointments('past').map(renderAppointmentCard)
            )}
          </TabsContent>

          <TabsContent value="cancelled">
            {filterAppointments('cancelled').length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay citas canceladas
              </p>
            ) : (
              filterAppointments('cancelled').map(renderAppointmentCard)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
