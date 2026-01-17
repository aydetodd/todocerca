import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { AlertTriangle, Phone, Clock, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Icono personalizado para emergencia
const emergencyIcon = new L.DivIcon({
  className: 'emergency-marker',
  html: `
    <div style="
      width: 40px;
      height: 40px;
      background: #dc2626;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 4px solid white;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
      animation: pulse 1.5s infinite;
    ">
      <span style="color: white; font-weight: bold; font-size: 14px;">SOS</span>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
    </style>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

interface SOSAlert {
  id: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  expires_at: string;
}

interface UserProfile {
  apodo: string | null;
  nombre: string;
  telefono: string | null;
}

export default function SOSView() {
  const { token } = useParams<{ token: string }>();
  const [alert, setAlert] = useState<SOSAlert | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const fetchAlert = async () => {
      if (!token) {
        setError('Token no válido');
        setLoading(false);
        return;
      }

      const { data: alertData, error: alertError } = await supabase
        .from('sos_alerts')
        .select('*')
        .eq('share_token', token)
        .single();

      if (alertError || !alertData) {
        setError('Alerta no encontrada');
        setLoading(false);
        return;
      }

      if (alertData.status !== 'active') {
        setError(alertData.status === 'cancelled' 
          ? 'Esta alerta fue cancelada - Todo está bien' 
          : 'Esta alerta ha expirado'
        );
        setLoading(false);
        return;
      }

      if (new Date(alertData.expires_at) < new Date()) {
        setError('Esta alerta ha expirado');
        setLoading(false);
        return;
      }

      setAlert(alertData as SOSAlert);

      // Obtener perfil del usuario
      const { data: profileData } = await supabase
        .from('profiles')
        .select('apodo, nombre, telefono')
        .eq('user_id', alertData.user_id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      setLoading(false);
    };

    fetchAlert();

    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel(`sos_alert_${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sos_alerts',
          filter: `share_token=eq.${token}`,
        },
        (payload: any) => {
          if (payload.new) {
            if (payload.new.status !== 'active') {
              setError(payload.new.status === 'cancelled' 
                ? 'Esta alerta fue cancelada - Todo está bien' 
                : 'Esta alerta ha expirado'
              );
              setAlert(null);
            } else {
              setAlert(payload.new as SOSAlert);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  // Actualizar tiempo restante
  useEffect(() => {
    if (!alert) return;

    const updateTime = () => {
      const now = new Date();
      const expires = new Date(alert.expires_at);
      const diff = expires.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Expirada');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [alert]);

  const handleCall = () => {
    if (profile?.telefono) {
      window.location.href = `tel:${profile.telefono}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando alerta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">
              {error.includes('cancelada') ? '✅' : '⚠️'} {error}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const userName = profile?.apodo || profile?.nombre || 'Usuario';
  const hasLocation = alert?.latitude && alert?.longitude;

  return (
    <div className="min-h-screen bg-background">
      {/* Header de emergencia */}
      <header className="bg-destructive text-destructive-foreground p-4 sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 animate-pulse" />
            <div>
              <h1 className="font-bold">🆘 Alerta SOS</h1>
              <p className="text-sm opacity-90">{userName} necesita ayuda</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Clock className="h-4 w-4" />
            <span>{timeRemaining}</span>
          </div>
        </div>
      </header>

      {/* Mapa */}
      <div className="h-[50vh] relative">
        {hasLocation ? (
          <MapContainer
            center={[alert!.latitude!, alert!.longitude!]}
            zoom={16}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={[alert!.latitude!, alert!.longitude!]}
              icon={emergencyIcon}
            >
              <Popup>
                <strong>🆘 {userName}</strong>
                <br />
                Ubicación de emergencia
              </Popup>
            </Marker>
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center bg-muted">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Ubicación no disponible</p>
            </div>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-destructive">
                ¡{userName} necesita ayuda!
              </p>
              <p className="text-sm text-muted-foreground">
                Activada: {alert ? new Date(alert.created_at).toLocaleTimeString() : ''}
              </p>
            </div>

            {profile?.telefono && (
              <Button
                onClick={handleCall}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Phone className="h-5 w-5 mr-2" />
                Llamar a {userName}
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => window.location.href = 'tel:911'}
            >
              <Phone className="h-5 w-5 mr-2" />
              Llamar al 911
            </Button>

            {hasLocation && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${alert!.latitude},${alert!.longitude}`,
                    '_blank'
                  );
                }}
              >
                <MapPin className="h-5 w-5 mr-2" />
                Abrir en Google Maps
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
