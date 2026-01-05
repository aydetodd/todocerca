import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { toast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { format, addDays, isSameDay, startOfToday, getDay, parse, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

interface TimeSlot {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
}

interface DaySchedule {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  es_descanso: boolean;
  duracion_cita_minutos: number;
}

interface AppointmentBookingProps {
  proveedorId: string;
  proveedorNombre: string;
  proveedorTelefono: string | null;
  onClose?: () => void;
}

export function AppointmentBooking({ 
  proveedorId, 
  proveedorNombre, 
  proveedorTelefono,
  onClose 
}: AppointmentBookingProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [servicio, setServicio] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    loadScheduleAndAppointments();
    loadUserProfile();
  }, [proveedorId]);

  const loadUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('apodo, telefono')
        .eq('user_id', user.id)
        .single();
      
      if (profile) {
        setClienteNombre(profile.apodo || '');
        setClienteTelefono(profile.telefono || '');
      }
    }
  };

  const loadScheduleAndAppointments = async () => {
    try {
      // Cargar horarios del proveedor
      const { data: horarios, error: horariosError } = await supabase
        .from('horarios_proveedor')
        .select('*')
        .eq('proveedor_id', proveedorId);

      if (horariosError) throw horariosError;
      setSchedule(horarios || []);

      // Cargar citas existentes (próximos 30 días)
      const today = startOfToday();
      const endDate = addDays(today, 30);
      
      const { data: citas, error: citasError } = await supabase
        .from('citas')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .gte('fecha', format(today, 'yyyy-MM-dd'))
        .lte('fecha', format(endDate, 'yyyy-MM-dd'))
        .neq('estado', 'cancelada');

      if (citasError) throw citasError;
      setExistingAppointments(citas || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la disponibilidad',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Obtener días habilitados según horario del proveedor
  const enabledDays = useMemo(() => {
    const workDays = new Set<number>();
    schedule.forEach(s => {
      if (!s.es_descanso) {
        workDays.add(s.dia_semana);
      }
    });
    return workDays;
  }, [schedule]);

  // Verificar si un día está habilitado
  const isDayEnabled = (date: Date) => {
    const dayOfWeek = getDay(date);
    return enabledDays.has(dayOfWeek) && date >= startOfToday();
  };

  // Obtener slots disponibles para la fecha seleccionada
  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];

    const dayOfWeek = getDay(selectedDate);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Obtener horarios de trabajo para este día
    const daySchedules = schedule.filter(s => s.dia_semana === dayOfWeek);
    
    if (daySchedules.length === 0) return [];

    // Encontrar horarios de trabajo (no descanso)
    const workSchedules = daySchedules.filter(s => !s.es_descanso);
    const breakSchedules = daySchedules.filter(s => s.es_descanso);
    
    if (workSchedules.length === 0) return [];

    const duracion = workSchedules[0]?.duracion_cita_minutos || 60;
    const slots: TimeSlot[] = [];

    workSchedules.forEach(work => {
      let currentTime = parse(work.hora_inicio, 'HH:mm:ss', new Date());
      const endTime = parse(work.hora_fin, 'HH:mm:ss', new Date());

      while (currentTime < endTime) {
        const slotEnd = addMinutes(currentTime, duracion);
        if (slotEnd > endTime) break;

        const slotStart = format(currentTime, 'HH:mm');
        const slotEndStr = format(slotEnd, 'HH:mm');

        // Verificar si está en horario de descanso
        const isInBreak = breakSchedules.some(brk => {
          const breakStart = brk.hora_inicio.slice(0, 5);
          const breakEnd = brk.hora_fin.slice(0, 5);
          return slotStart >= breakStart && slotStart < breakEnd;
        });

        // Verificar si ya hay una cita
        const isBooked = existingAppointments.some(apt => {
          if (apt.fecha !== dateStr) return false;
          const aptStart = apt.hora_inicio.slice(0, 5);
          return aptStart === slotStart;
        });

        if (!isInBreak) {
          slots.push({
            hora_inicio: slotStart,
            hora_fin: slotEndStr,
            disponible: !isBooked
          });
        }

        currentTime = slotEnd;
      }
    });

    return slots;
  }, [selectedDate, schedule, existingAppointments]);

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || !clienteNombre.trim() || !clienteTelefono.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Por favor completa todos los campos requeridos',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const slot = availableSlots.find(s => s.hora_inicio === selectedTime);
      if (!slot) throw new Error('Slot no encontrado');

      const { data: { user } } = await supabase.auth.getUser();

      // Crear la cita
      const { error } = await supabase
        .from('citas')
        .insert({
          proveedor_id: proveedorId,
          cliente_user_id: user?.id || null,
          cliente_nombre: clienteNombre,
          cliente_telefono: clienteTelefono,
          fecha: format(selectedDate, 'yyyy-MM-dd'),
          hora_inicio: selectedTime,
          hora_fin: slot.hora_fin,
          servicio: servicio || null,
          notas: notas || null,
          estado: 'pendiente'
        });

      if (error) throw error;

      // Enviar por WhatsApp
      if (proveedorTelefono) {
        const mensaje = `🗓️ *Nueva Cita Agendada*\n\n` +
          `📅 Fecha: ${format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}\n` +
          `🕐 Hora: ${selectedTime} - ${slot.hora_fin}\n` +
          `👤 Cliente: ${clienteNombre}\n` +
          `📱 Teléfono: ${clienteTelefono}\n` +
          (servicio ? `💼 Servicio: ${servicio}\n` : '') +
          (notas ? `📝 Notas: ${notas}` : '');
        
        const whatsappUrl = `https://wa.me/${proveedorTelefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
        window.open(whatsappUrl, '_blank');
      }

      toast({
        title: '¡Cita agendada!',
        description: `Tu cita para el ${format(selectedDate, "d 'de' MMMM", { locale: es })} a las ${selectedTime} ha sido registrada.`
      });

      onClose?.();
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agendar la cita',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando disponibilidad...</div>;
  }

  if (schedule.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Este proveedor aún no ha configurado su horario de citas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Agendar Cita con {proveedorNombre}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calendario */}
        <div>
          <Label className="mb-2 block">Selecciona una fecha:</Label>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              setSelectedDate(date);
              setSelectedTime(null);
            }}
            disabled={(date) => !isDayEnabled(date)}
            locale={es}
            className="rounded-md border mx-auto"
          />
        </div>

        {/* Horarios disponibles */}
        {selectedDate && (
          <div>
            <Label className="mb-2 block">
              Horarios disponibles para {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}:
            </Label>
            {availableSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay horarios disponibles para esta fecha.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {availableSlots.map((slot) => (
                  <Badge
                    key={slot.hora_inicio}
                    variant={selectedTime === slot.hora_inicio ? "default" : slot.disponible ? "outline" : "secondary"}
                    className={`cursor-pointer justify-center py-2 ${
                      !slot.disponible ? 'opacity-50 cursor-not-allowed line-through' : 'hover:bg-primary/80'
                    }`}
                    onClick={() => slot.disponible && setSelectedTime(slot.hora_inicio)}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {slot.hora_inicio}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Formulario de datos */}
        {selectedTime && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nombre">Tu nombre *</Label>
                <Input
                  id="nombre"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <Label htmlFor="telefono">Tu teléfono *</Label>
                <Input
                  id="telefono"
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder="+52 123 456 7890"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="servicio">Servicio solicitado</Label>
              <Input
                id="servicio"
                value={servicio}
                onChange={(e) => setServicio(e.target.value)}
                placeholder="Ej: Corte de cabello, Manicure, etc."
              />
            </div>

            <div>
              <Label htmlFor="notas">Notas adicionales</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Instrucciones especiales..."
                rows={2}
              />
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              <MessageCircle className="h-4 w-4 mr-2" />
              {submitting ? 'Agendando...' : 'Agendar y Enviar por WhatsApp'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
