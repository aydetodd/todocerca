import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Clock, Plus, Trash2, Coffee } from 'lucide-react';

interface TimeSlot {
  id?: string;
  hora_inicio: string;
  hora_fin: string;
  es_descanso: boolean;
}

interface DaySchedule {
  dia_semana: number;
  activo: boolean;
  slots: TimeSlot[];
}

const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

interface ScheduleConfigurationProps {
  proveedorId: string;
}

export function ScheduleConfiguration({ proveedorId }: ScheduleConfigurationProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [duracionCita, setDuracionCita] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSchedule();
  }, [proveedorId]);

  const loadSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('horarios_proveedor')
        .select('*')
        .eq('proveedor_id', proveedorId)
        .order('dia_semana')
        .order('hora_inicio');

      if (error) throw error;

      // Inicializar días
      const initialSchedule: DaySchedule[] = DIAS_SEMANA.map((_, index) => ({
        dia_semana: index,
        activo: false,
        slots: []
      }));

      // Poblar con datos existentes
      (data || []).forEach((horario: any) => {
        const dayIndex = horario.dia_semana;
        initialSchedule[dayIndex].activo = true;
        initialSchedule[dayIndex].slots.push({
          id: horario.id,
          hora_inicio: horario.hora_inicio,
          hora_fin: horario.hora_fin,
          es_descanso: horario.es_descanso
        });
        if (horario.duracion_cita_minutos) {
          setDuracionCita(horario.duracion_cita_minutos);
        }
      });

      setSchedule(initialSchedule);
    } catch (error) {
      console.error('Error loading schedule:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el horario',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (dayIndex: number) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].activo = !updated[dayIndex].activo;
      if (updated[dayIndex].activo && updated[dayIndex].slots.length === 0) {
        // Agregar horario por defecto
        updated[dayIndex].slots = [{
          hora_inicio: '09:00',
          hora_fin: '18:00',
          es_descanso: false
        }];
      }
      return updated;
    });
  };

  const addSlot = (dayIndex: number, esDescanso: boolean = false) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].slots.push({
        hora_inicio: esDescanso ? '13:00' : '09:00',
        hora_fin: esDescanso ? '14:00' : '18:00',
        es_descanso: esDescanso
      });
      return updated;
    });
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].slots.splice(slotIndex, 1);
      return updated;
    });
  };

  const updateSlot = (dayIndex: number, slotIndex: number, field: string, value: string) => {
    setSchedule(prev => {
      const updated = [...prev];
      (updated[dayIndex].slots[slotIndex] as any)[field] = value;
      return updated;
    });
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      // Eliminar horarios existentes
      const { error: deleteError } = await supabase
        .from('horarios_proveedor')
        .delete()
        .eq('proveedor_id', proveedorId);

      if (deleteError) throw deleteError;

      // Insertar nuevos horarios
      const horariosToInsert: any[] = [];
      
      schedule.forEach(day => {
        if (day.activo) {
          day.slots.forEach(slot => {
            horariosToInsert.push({
              proveedor_id: proveedorId,
              dia_semana: day.dia_semana,
              hora_inicio: slot.hora_inicio,
              hora_fin: slot.hora_fin,
              es_descanso: slot.es_descanso,
              duracion_cita_minutos: duracionCita
            });
          });
        }
      });

      if (horariosToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('horarios_proveedor')
          .insert(horariosToInsert);

        if (insertError) throw insertError;
      }

      toast({
        title: 'Horario guardado',
        description: 'Tu horario de trabajo se ha actualizado'
      });
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el horario',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Cargando horario...</div>;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-3 py-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-2xl">
          <Clock className="h-5 w-5 shrink-0" />
          Configurar Horario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-3 pb-4 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Label className="text-sm shrink-0">Duración cita:</Label>
          <Input
            type="number"
            value={duracionCita}
            onChange={(e) => setDuracionCita(parseInt(e.target.value) || 60)}
            className="w-20"
            min={15}
            step={15}
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>

        <div className="space-y-3">
          {schedule.map((day, dayIndex) => (
            <div key={dayIndex} className="border rounded-lg p-2.5 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={day.activo}
                    onCheckedChange={() => toggleDay(dayIndex)}
                  />
                  <span className="font-medium text-sm sm:text-base">{DIAS_SEMANA[dayIndex]}</span>
                </div>
                {day.activo && (
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => addSlot(dayIndex, false)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-0.5" />
                      Horario
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => addSlot(dayIndex, true)}
                    >
                      <Coffee className="h-3.5 w-3.5 mr-0.5" />
                      Descanso
                    </Button>
                  </div>
                )}
              </div>

              {day.activo && day.slots.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {day.slots.map((slot, slotIndex) => (
                    <div
                      key={slotIndex}
                      className={`flex items-center gap-1.5 p-1.5 rounded text-sm ${
                        slot.es_descanso ? 'bg-orange-500/10' : 'bg-primary/10'
                      }`}
                    >
                      {slot.es_descanso && (
                        <Coffee className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      )}
                      <Input
                        type="time"
                        value={slot.hora_inicio}
                        onChange={(e) => updateSlot(dayIndex, slotIndex, 'hora_inicio', e.target.value)}
                        className="h-8 text-xs px-1.5 min-w-0 flex-1 max-w-[5.5rem]"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">a</span>
                      <Input
                        type="time"
                        value={slot.hora_fin}
                        onChange={(e) => updateSlot(dayIndex, slotIndex, 'hora_fin', e.target.value)}
                        className="h-8 text-xs px-1.5 min-w-0 flex-1 max-w-[5.5rem]"
                      />
                      <span className="text-xs text-muted-foreground shrink-0 hidden xs:inline">
                        {slot.es_descanso ? 'Desc.' : 'Trab.'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => removeSlot(dayIndex, slotIndex)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <Button onClick={saveSchedule} disabled={saving} className="w-full">
          {saving ? 'Guardando...' : 'Guardar Horario'}
        </Button>
      </CardContent>
    </Card>
  );
}
