// GlobalSOSListener - Escucha alertas SOS en tiempo real para todos los usuarios autenticados
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Phone, MapPin, VolumeX, AlertTriangle } from 'lucide-react';

// Request notification permission on load
if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

interface SOSAlertData {
  senderName: string;
  senderPhone: string | null;
  message: string;
  shareLink: string;
}

export const GlobalSOSListener = () => {
  const { toast } = useToast();
  const [activeSOSAlert, setActiveSOSAlert] = useState<SOSAlertData | null>(null);
  const [alarmAudio, setAlarmAudio] = useState<HTMLAudioElement | null>(null);

  const stopAlarm = () => {
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio.loop = false;
      setAlarmAudio(null);
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  };

  const closeAlert = () => {
    stopAlarm();
    setActiveSOSAlert(null);
  };

  useEffect(() => {
    let currentAudio: HTMLAudioElement | null = null;

    const setupListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel('global_sos_alerts')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `is_panic=eq.true`
          },
          async (payload: any) => {
            const newMessage = payload.new;
            
            // Solo procesar si somos el receptor (no el emisor)
            if (newMessage.sender_id === user.id) {
              // El emisor NO recibe alarma (seguridad ante delincuentes)
              return;
            }

            // Verificar si somos contacto del emisor
            const { data: isContact } = await supabase
              .from('user_contacts')
              .select('id')
              .eq('user_id', newMessage.sender_id)
              .eq('contact_user_id', user.id)
              .maybeSingle();

            // También verificar si el mensaje nos fue enviado directamente
            const isDirectMessage = newMessage.receiver_id === user.id;

            if (!isContact && !isDirectMessage) {
              return; // No somos contacto ni destinatario
            }

            // Obtener info del emisor
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('apodo, nombre, telefono')
              .eq('user_id', newMessage.sender_id)
              .single();

            const senderName = senderProfile?.apodo || senderProfile?.nombre || 'Un contacto';
            
            // Extraer link del mensaje si existe
            const linkMatch = newMessage.message.match(/https?:\/\/[^\s]+/);
            const shareLink = linkMatch ? linkMatch[0] : '';

            // ====== ALARMA FUERTE ======
            // Crear y reproducir sirena de emergencia a volumen máximo
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2462/2462-preview.mp3');
            audio.volume = 1.0;
            audio.loop = true;
            
            try {
              await audio.play();
              currentAudio = audio;
              setAlarmAudio(audio);
            } catch (e) {
              console.log('Audio play failed (user interaction required):', e);
            }

            // Parar automáticamente después de 60 segundos
            setTimeout(() => {
              if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentAudio.loop = false;
                currentAudio = null;
                setAlarmAudio(null);
              }
            }, 60000);

            // Vibración patrón SOS
            if ('vibrate' in navigator) {
              const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
              navigator.vibrate(sosPattern);
              // Repetir vibración
              const vibrateInterval = setInterval(() => {
                if (currentAudio) {
                  navigator.vibrate(sosPattern);
                } else {
                  clearInterval(vibrateInterval);
                }
              }, 3000);
            }

            // Mostrar alerta modal
            setActiveSOSAlert({
              senderName,
              senderPhone: senderProfile?.telefono || null,
              message: newMessage.message,
              shareLink
            });

            // Notificación del sistema
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`🆘 ¡EMERGENCIA! ${senderName}`, {
                body: 'Necesita ayuda urgente. Toca para ver ubicación.',
                icon: '/icon-192.png',
                tag: 'sos-emergency',
                requireInteraction: true
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }
      };
    };

    setupListener();

    return () => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
    };
  }, []);

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const handleViewLocation = (link: string) => {
    stopAlarm();
    window.open(link, '_blank');
  };

  return (
    <AlertDialog open={!!activeSOSAlert} onOpenChange={(open) => !open && closeAlert()}>
      <AlertDialogContent className="border-red-500 border-2 bg-red-50 dark:bg-red-950">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl text-red-600 flex items-center gap-2 animate-pulse">
            <AlertTriangle className="h-8 w-8" />
            🆘 ¡EMERGENCIA!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-lg text-foreground">
            <span className="font-bold text-xl block mb-2">
              {activeSOSAlert?.senderName} necesita ayuda
            </span>
            <span className="text-muted-foreground">
              {activeSOSAlert?.message}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 mt-4">
          <Button 
            onClick={stopAlarm} 
            variant="outline" 
            className="w-full border-orange-500 text-orange-600 hover:bg-orange-100"
          >
            <VolumeX className="h-5 w-5 mr-2" />
            Silenciar Alarma
          </Button>

          {activeSOSAlert?.shareLink && (
            <Button 
              onClick={() => handleViewLocation(activeSOSAlert.shareLink)}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <MapPin className="h-5 w-5 mr-2" />
              Ver Ubicación
            </Button>
          )}

          {activeSOSAlert?.senderPhone && (
            <Button 
              onClick={() => handleCall(activeSOSAlert.senderPhone!)}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Phone className="h-5 w-5 mr-2" />
              Llamar a {activeSOSAlert.senderName}
            </Button>
          )}

          <Button 
            onClick={() => handleCall('911')}
            variant="destructive"
            className="w-full"
          >
            <Phone className="h-5 w-5 mr-2" />
            Llamar al 911
          </Button>

          <Button 
            onClick={closeAlert}
            variant="ghost"
            className="w-full"
          >
            Cerrar
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
