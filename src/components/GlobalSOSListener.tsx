// GlobalSOSListener - Escucha alertas SOS en tiempo real para todos los usuarios autenticados
import { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, VolumeX, AlertTriangle, X, Navigation, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Lazy load del mapa para evitar bloqueos
const SOSMapView = lazy(() => import('./SOSMapView'));

// Request notification permission on load
if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

interface SOSAlertData {
  senderName: string;
  senderPhone: string | null;
  message: string;
  shareLink: string;
  latitude: number | null;
  longitude: number | null;
}

// Sistema de alarma tipo sirena/incendio con Web Audio API
let sosAudioContext: AudioContext | null = null;
let sosAlertInterval: NodeJS.Timeout | null = null;
let sosVibrateInterval: NodeJS.Timeout | null = null;

const playSirenTone = () => {
  try {
    if (!sosAudioContext || sosAudioContext.state === 'closed') {
      sosAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = sosAudioContext;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const currentTime = ctx.currentTime;
    
    // Crear sonido de sirena tipo alarma de incendio/sismo
    // Alternando entre frecuencias altas y bajas rápidamente
    const createSirenOscillator = (startFreq: number, endFreq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sawtooth'; // Sonido más áspero/fuerte
      oscillator.frequency.setValueAtTime(startFreq, currentTime + startTime);
      oscillator.frequency.linearRampToValueAtTime(endFreq, currentTime + startTime + duration);
      
      // Un poco más alto; en móvil el volumen final depende del volumen multimedia del dispositivo
      gainNode.gain.setValueAtTime(1.0, currentTime + startTime);
      gainNode.gain.setValueAtTime(1.0, currentTime + startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + startTime + duration);
      
      oscillator.start(currentTime + startTime);
      oscillator.stop(currentTime + startTime + duration);
    };
    
    // Patrón de sirena: subida y bajada rápida tipo alarma de incendio
    createSirenOscillator(400, 1200, 0, 0.3);
    createSirenOscillator(1200, 400, 0.3, 0.3);
    createSirenOscillator(400, 1200, 0.6, 0.3);
    createSirenOscillator(1200, 400, 0.9, 0.3);
    
  } catch (error) {
    console.error('Error reproduciendo sirena SOS:', error);
  }
};

const startSOSAlarmLoop = () => {
  if (sosAlertInterval) return; // Ya está sonando
  
  // Reproducir inmediatamente
  playSirenTone();
  
  // Vibración inicial SOS
  if ('vibrate' in navigator) {
    const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
    navigator.vibrate(sosPattern);
  }
  
  // Loop cada 1.2 segundos
  sosAlertInterval = setInterval(() => {
    playSirenTone();
  }, 1200);
  
  // Loop de vibración cada 3 segundos
  sosVibrateInterval = setInterval(() => {
    if ('vibrate' in navigator) {
      const sosPattern = [300, 100, 300, 100, 300, 300, 600, 100, 600, 100, 600, 300, 300, 100, 300, 100, 300];
      navigator.vibrate(sosPattern);
    }
  }, 3000);
};

const stopSOSAlarmLoop = () => {
  if (sosAlertInterval) {
    clearInterval(sosAlertInterval);
    sosAlertInterval = null;
  }
  if (sosVibrateInterval) {
    clearInterval(sosVibrateInterval);
    sosVibrateInterval = null;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
};

export const GlobalSOSListener = () => {
  const { user } = useAuth();
  const [activeSOSAlert, setActiveSOSAlert] = useState<SOSAlertData | null>(null);
  const [isAlarmMuted, setIsAlarmMuted] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const alertRef = useRef<SOSAlertData | null>(null);

  const stopAlarm = () => {
    stopSOSAlarmLoop();
    setIsAlarmMuted(true);
  };

  const closeAlert = () => {
    stopSOSAlarmLoop();
    setActiveSOSAlert(null);
    alertRef.current = null;
    setIsAlarmMuted(false);
    setShowMap(false);
  };

  useEffect(() => {
    if (!user) return;

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

          // ====== INICIAR ALARMA TIPO SIRENA/INCENDIO ======
          setIsAlarmMuted(false);
          startSOSAlarmLoop();
          setShowMap(false);

          const alertData: SOSAlertData = {
            senderName,
            senderPhone: senderProfile?.telefono || null,
            message: newMessage.message,
            shareLink,
            latitude,
            longitude,
          };
          
          setActiveSOSAlert(alertData);
          alertRef.current = alertData;

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
      stopSOSAlarmLoop();
    };
  }, [user]);

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Si no hay alerta activa, no renderizar nada
  if (!activeSOSAlert) return null;

  const hasCoords = activeSOSAlert.latitude != null && activeSOSAlert.longitude != null;

  // Usar un Card fijo en lugar de AlertDialog para NO bloquear la navegación
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      {/* Overlay semi-transparente que NO bloquea clicks */}
      <div 
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={closeAlert}
      />
      
      {/* Card de emergencia */}
      <Card className="relative z-10 w-full max-w-md border-4 border-red-500 bg-red-50 dark:bg-red-950 shadow-2xl pointer-events-auto animate-pulse max-h-[85vh] overflow-y-auto">
        {/* Botón X para cerrar */}
        <button
          onClick={closeAlert}
          className="absolute top-3 right-3 p-2 rounded-full bg-red-200 hover:bg-red-300 dark:bg-red-800 dark:hover:bg-red-700 transition-colors z-10"
          aria-label="Cerrar"
        >
          <X className="h-6 w-6 text-red-600 dark:text-red-300" />
        </button>

        <CardHeader className="pb-2">
          <CardTitle className="text-2xl text-red-600 flex items-center gap-2 pr-10">
            <AlertTriangle className="h-8 w-8 animate-bounce" />
            🆘 ¡EMERGENCIA!
          </CardTitle>
          <p className="text-xl font-bold text-foreground mt-2">
            {activeSOSAlert.senderName} necesita ayuda
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si no escuchas la sirena, sube el volumen multimedia del teléfono.
          </p>

          {/* Mapa: NO auto-cargar para evitar bloqueos/pantalla negra en web móvil */}
          {hasCoords && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowMap((v) => !v)}
              >
                <MapPin className="h-4 w-4 mr-2" />
                {showMap ? 'Ocultar mapa' : 'Ver mapa'}
              </Button>

              {showMap && (
                <ErrorBoundary
                  name="SOSMapView"
                  fallback={
                    <div className="h-40 rounded-lg overflow-hidden border-2 border-red-300 bg-muted flex items-center justify-center">
                      <div className="text-center">
                        <MapPin className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground mt-2">
                          No se pudo cargar el mapa (pero puedes navegar con Google Maps).
                        </p>
                      </div>
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div className="h-40 rounded-lg overflow-hidden border-2 border-red-300 bg-muted flex items-center justify-center">
                        <div className="text-center">
                          <MapPin className="h-8 w-8 text-muted-foreground mx-auto animate-bounce" />
                          <p className="text-sm text-muted-foreground mt-2">Cargando mapa...</p>
                        </div>
                      </div>
                    }
                  >
                    <SOSMapView
                      latitude={activeSOSAlert.latitude!}
                      longitude={activeSOSAlert.longitude!}
                      senderName={activeSOSAlert.senderName}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          )}

          <div className="space-y-3">
            {/* Botón silenciar - más prominente si alarma activa */}
            {!isAlarmMuted && (
              <Button
                onClick={stopAlarm}
                variant="destructive"
                className="w-full text-lg py-6 animate-pulse bg-orange-500 hover:bg-orange-600"
              >
                <VolumeX className="h-6 w-6 mr-2" />
                🔇 Silenciar Alarma
              </Button>
            )}

            {activeSOSAlert.latitude && activeSOSAlert.longitude && (
              <Button 
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${activeSOSAlert.latitude},${activeSOSAlert.longitude}`,
                    '_blank'
                  );
                }} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-5"
              >
                <Navigation className="h-5 w-5 mr-2" />
                Navegar con Google Maps
              </Button>
            )}

            {activeSOSAlert.senderPhone && (
              <Button
                onClick={() => handleCall(activeSOSAlert.senderPhone!)}
                className="w-full bg-green-600 hover:bg-green-700 text-lg py-5"
              >
                <Phone className="h-5 w-5 mr-2" />
                Llamar a {activeSOSAlert.senderName}
              </Button>
            )}

            <Button 
              onClick={() => handleCall('911')} 
              variant="destructive" 
              className="w-full text-lg py-5"
            >
              <Phone className="h-5 w-5 mr-2" />
              Llamar al 911
            </Button>

            {/* Botón cerrar secundario */}
            <Button 
              onClick={closeAlert} 
              variant="outline" 
              className="w-full"
            >
              Cerrar alerta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
