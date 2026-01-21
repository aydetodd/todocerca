// GlobalSOSListener - Escucha alertas SOS en tiempo real para todos los usuarios autenticados
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Phone, MapPin, VolumeX, AlertTriangle, X, Navigation } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Request notification permission on load
if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Icono de emergencia para el mapa
const emergencyIcon = new L.DivIcon({
  className: 'sos-marker',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: #dc2626;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
      animation: pulse 1s infinite;
    ">
      <span style="color: white; font-weight: bold; font-size: 10px;">SOS</span>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface SOSAlertData {
  senderName: string;
  senderPhone: string | null;
  message: string;
  shareLink: string;
  latitude: number | null;
  longitude: number | null;
}

export const GlobalSOSListener = () => {
  const { user } = useAuth();
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
    // Importante: este componente se monta incluso en /auth.
    // Si el usuario inicia sesión después, necesitamos (re)crear la suscripción.
    if (!user) return;

    let currentAudio: HTMLAudioElement | null = null;

    const channel = supabase
      .channel(`global_sos_alerts_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `is_panic=eq.true`,
        },
        async (payload: any) => {
          const newMessage = payload.new;

          // El emisor NO recibe alarma (seguridad ante delincuentes)
          if (newMessage.sender_id === user.id) return;

          // Solo procesar si somos el receptor directo
          const isDirectMessage = newMessage.receiver_id === user.id;
          if (!isDirectMessage) return;

          // Obtener info del emisor
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('apodo, nombre, telefono')
            .eq('user_id', newMessage.sender_id)
            .single();

          const senderName = senderProfile?.apodo || senderProfile?.nombre || 'Un contacto';

          // Extraer link del mensaje y obtener token para buscar coordenadas
          const linkMatch = newMessage.message.match(/https?:\/\/[^\s]+/);
          const shareLink = linkMatch ? linkMatch[0] : '';
          
          // Obtener coordenadas de la alerta SOS
          let latitude: number | null = null;
          let longitude: number | null = null;
          
          if (shareLink) {
            const tokenMatch = shareLink.match(/\/sos\/([a-zA-Z0-9-]+)/);
            if (tokenMatch) {
              const { data: alertData } = await supabase
                .from('sos_alerts')
                .select('latitude, longitude')
                .eq('share_token', tokenMatch[1])
                .single();
              
              if (alertData) {
                latitude = alertData.latitude;
                longitude = alertData.longitude;
              }
            }
          }

          // ====== ALARMA DE SIRENA DE EMERGENCIA ======
          // Sonido de sirena real largo (civil defense siren)
          const audio = new Audio('https://www.soundjay.com/transportation/sounds/siren-alarm-1.mp3');
          audio.volume = 1.0;
          audio.loop = true;
          audio.preload = 'auto';

          const playAudio = async () => {
            try {
              await audio.play();
              currentAudio = audio;
              setAlarmAudio(audio);
            } catch (e) {
              console.log('Audio play failed, retrying with user gesture...', e);
              // Intento con evento de click
              const playOnClick = () => {
                audio.play().catch(() => {});
                document.removeEventListener('click', playOnClick);
              };
              document.addEventListener('click', playOnClick, { once: true });
            }
          };
          
          playAudio();

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
            const vibrateInterval = setInterval(() => {
              if (currentAudio) {
                navigator.vibrate(sosPattern);
              } else {
                clearInterval(vibrateInterval);
              }
            }, 3000);
          }

          setActiveSOSAlert({
            senderName,
            senderPhone: senderProfile?.telefono || null,
            message: newMessage.message,
            shareLink,
            latitude,
            longitude,
          });

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`🆘 ¡EMERGENCIA! ${senderName}`, {
              body: 'Necesita ayuda urgente. Toca para ver ubicación.',
              icon: '/icon-192.png',
              tag: 'sos-emergency',
              requireInteraction: true,
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
  }, [user]);

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const handleViewLocation = (link: string) => {
    stopAlarm();
    window.open(link, '_blank');
  };

  return (
    <AlertDialog open={!!activeSOSAlert} onOpenChange={(open) => !open && closeAlert()}>
      <AlertDialogContent className="border-red-500 border-2 bg-red-50 dark:bg-red-950 max-w-md max-h-[90vh] overflow-y-auto">
        {/* Botón X para cerrar */}
        <button
          onClick={closeAlert}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-red-200 dark:hover:bg-red-800 transition-colors z-10"
          aria-label="Cerrar"
        >
          <X className="h-6 w-6 text-red-600" />
        </button>

        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl text-red-600 flex items-center gap-2 animate-pulse pr-8">
            <AlertTriangle className="h-8 w-8" />
            🆘 ¡EMERGENCIA!
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-lg text-foreground">
              <span className="font-bold text-xl block mb-2">{activeSOSAlert?.senderName} necesita ayuda</span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Mapa integrado si hay ubicación */}
        {activeSOSAlert?.latitude && activeSOSAlert?.longitude && (
          <div className="h-48 rounded-lg overflow-hidden border-2 border-red-300 my-2">
            <MapContainer
              center={[activeSOSAlert.latitude, activeSOSAlert.longitude]}
              zoom={15}
              className="h-full w-full"
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[activeSOSAlert.latitude, activeSOSAlert.longitude]}
                icon={emergencyIcon}
              >
                <Popup>
                  <strong>🆘 {activeSOSAlert.senderName}</strong>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        )}

        <div className="space-y-3 mt-2">
          <Button
            onClick={stopAlarm}
            variant="outline"
            className="w-full border-orange-500 text-orange-600 hover:bg-orange-100"
          >
            <VolumeX className="h-5 w-5 mr-2" />
            Silenciar Alarma
          </Button>

          {activeSOSAlert?.latitude && activeSOSAlert?.longitude && (
            <Button 
              onClick={() => {
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${activeSOSAlert.latitude},${activeSOSAlert.longitude}`,
                  '_blank'
                );
              }} 
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Navigation className="h-5 w-5 mr-2" />
              Navegar con Google Maps
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

          <Button onClick={() => handleCall('911')} variant="destructive" className="w-full">
            <Phone className="h-5 w-5 mr-2" />
            Llamar al 911
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

