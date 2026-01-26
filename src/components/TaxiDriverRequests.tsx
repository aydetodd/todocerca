import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, DollarSign, Loader2, Check, X, Clock, User, CheckCircle2, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TaxiLiveMap from './TaxiLiveMap';
import { playTaxiAlertSound, startTaxiAlertLoop, stopAlertLoop } from '@/lib/sounds';

interface TaxiRequest {
  id: string;
  passenger_id: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_address: string | null;
  distance_km: number;
  tarifa_km: number;
  total_fare: number;
  status: string;
  created_at: string;
  accepted_at: string | null;
  passengerName?: string;
  passengerPhone?: string;
}

export default function TaxiDriverRequests() {
  const { toast } = useToast();
  const [pendingRequests, setPendingRequests] = useState<TaxiRequest[]>([]);
  const [activeTrip, setActiveTrip] = useState<TaxiRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completingTrip, setCompletingTrip] = useState(false);
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  const [alertMuted, setAlertMuted] = useState(false);
  const mapRefs = useRef<{ [key: string]: L.Map }>({});
  const previousRequestIdsRef = useRef<Set<string>>(new Set());
  // Cargar solicitudes pendientes y viaje activo
  const fetchRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Cargar viaje activo (aceptado pero no completado)
    const { data: activeData, error: activeError } = await supabase
      .from('taxi_requests')
      .select('*')
      .eq('driver_id', user.id)
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeError && activeData) {
      // Obtener nombre del pasajero
      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre, telefono')
        .eq('user_id', activeData.passenger_id)
        .single();
      
      setActiveTrip({
        ...activeData,
        passengerName: profile?.nombre || 'Usuario',
        passengerPhone: profile?.telefono || ''
      });
    } else {
      setActiveTrip(null);
    }

    // Cargar solicitudes pendientes
    const { data, error } = await supabase
      .from('taxi_requests')
      .select('*')
      .eq('driver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando solicitudes:', error);
      return;
    }

    const currentIds = new Set((data || []).map(r => r.id));
    previousRequestIdsRef.current = currentIds;

    // Si no hay solicitudes pendientes, detener el sonido de alerta
    if (!data || data.length === 0) {
      stopAlertLoop();
    }

    // Obtener nombres de pasajeros
    const requestsWithNames = await Promise.all(
      (data || []).map(async (req) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nombre, telefono')
          .eq('user_id', req.passenger_id)
          .single();
        
        return {
          ...req,
          passengerName: profile?.nombre || 'Usuario',
          passengerPhone: profile?.telefono || ''
        };
      })
    );

    setPendingRequests(requestsWithNames);
    setLoading(false);
  };

  useEffect(() => {
    let driverId: string | null = null;
    let channel: any = null;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      driverId = user.id;
      
      // Cargar datos iniciales
      await fetchRequests();

      // Suscripción en tiempo real FILTRADA por driver_id
      channel = supabase
        .channel(`taxi-requests-driver-${driverId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'taxi_requests',
            filter: `driver_id=eq.${driverId}`
          },
          (payload) => {
            console.log('🔔 Nueva solicitud de taxi recibida:', payload);
            // Resetear estado de silenciado para nuevas solicitudes
            setAlertMuted(false);
            // Iniciar loop de sonido continuo en INSERT
            startTaxiAlertLoop();
            toast({
              title: '🚕 ¡Nueva solicitud de taxi!',
              description: 'Tienes una nueva solicitud pendiente',
            });
            fetchRequests();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'taxi_requests',
            filter: `driver_id=eq.${driverId}`
          },
          (payload) => {
            console.log('📝 Actualización de solicitud de taxi:', payload);
            fetchRequests();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'taxi_requests',
            filter: `driver_id=eq.${driverId}`
          },
          () => {
            fetchRequests();
          }
        )
        .subscribe((status) => {
          console.log('🔌 Suscripción taxi driver status:', status);
        });
    };

    setupSubscription();

    return () => {
      // Limpiar suscripción
      if (channel) {
        supabase.removeChannel(channel);
      }
      // Detener sonido de alerta si está activo
      stopAlertLoop();
      // Limpiar mapas
      Object.values(mapRefs.current).forEach(map => map.remove());
    };
  }, []);

  // Inicializar mapas para solicitudes pendientes
  useEffect(() => {
    pendingRequests.forEach((req) => {
      const containerId = `request-map-${req.id}`;
      const container = document.getElementById(containerId);
      
      if (container && !mapRefs.current[req.id]) {
        const map = L.map(container, {
          attributionControl: false,
          zoomControl: false,
          dragging: false,
          scrollWheelZoom: false
        }).setView([req.pickup_lat, req.pickup_lng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        L.marker([req.pickup_lat, req.pickup_lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 20px;">📍</div>',
            className: 'pickup-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(map);

        L.marker([req.destination_lat, req.destination_lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 20px;">🏁</div>',
            className: 'destination-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(map);

        const bounds = L.latLngBounds(
          [req.pickup_lat, req.pickup_lng],
          [req.destination_lat, req.destination_lng]
        );
        map.fitBounds(bounds, { padding: [20, 20] });

        mapRefs.current[req.id] = map;
      }
    });
  }, [pendingRequests]);

  // Aceptar solicitud
  const handleAccept = async (requestId: string) => {
    // Detener sonido al aceptar
    stopAlertLoop();
    setProcessingId(requestId);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('taxi_requests')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      // Cambiar estado del conductor a "busy" (amarillo) - actualiza el semáforo automáticamente
      if (user) {
        const { error: statusError } = await supabase
          .from('profiles')
          .update({ estado: 'busy' })
          .eq('user_id', user.id);
        
        if (statusError) {
          console.error('Error actualizando estado del conductor:', statusError);
        } else {
          console.log('🟡 Estado del conductor cambiado a OCUPADO (amarillo)');
        }
      }

      // Enviar WhatsApp al pasajero
      try {
        await supabase.functions.invoke('send-taxi-accepted-whatsapp', {
          body: { requestId }
        });
        console.log('WhatsApp enviado al pasajero');
      } catch (whatsappError) {
        console.error('Error enviando WhatsApp al pasajero:', whatsappError);
      }

      toast({
        title: "¡Solicitud aceptada!",
        description: "Tu semáforo cambió a AMARILLO (ocupado). El pasajero ha sido notificado.",
      });

      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo aceptar la solicitud",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Rechazar solicitud
  const handleReject = async (requestId: string) => {
    // Detener sonido al rechazar
    stopAlertLoop();
    setProcessingId(requestId);
    
    try {
      const { error } = await supabase
        .from('taxi_requests')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: "Solicitud rechazada",
        description: "El pasajero buscará otro taxi.",
      });

      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo rechazar la solicitud",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Completar viaje
  const handleCompleteTrip = async () => {
    if (!activeTrip) return;
    
    setCompletingTrip(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('taxi_requests')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', activeTrip.id);

      if (error) throw error;

      // Cambiar estado del conductor a "available" (verde) - semáforo vuelve a disponible
      if (user) {
        const { error: statusError } = await supabase
          .from('profiles')
          .update({ estado: 'available' })
          .eq('user_id', user.id);
        
        if (statusError) {
          console.error('Error actualizando estado del conductor:', statusError);
        } else {
          console.log('🟢 Estado del conductor cambiado a DISPONIBLE (verde)');
        }
      }

      toast({
        title: "¡Viaje completado!",
        description: `Tarifa: $${activeTrip.total_fare.toFixed(2)} MXN. Tu semáforo volvió a VERDE (disponible).`,
      });


      setActiveTrip(null);
      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo completar el viaje",
        variant: "destructive"
      });
    } finally {
      setCompletingTrip(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  // Test sound button
  const testSound = () => {
    playTaxiAlertSound();
  };

  // Silenciar alarma manualmente sin aceptar/rechazar
  const handleMuteAlert = () => {
    stopAlertLoop();
    setAlertMuted(true);
    toast({
      title: "🔇 Alarma silenciada",
      description: "Puedes decidir si aceptar o rechazar la solicitud.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Botones de control de sonido */}
      <div className="flex justify-end gap-2">
        {/* Botón para silenciar alarma activa */}
        {pendingRequests.length > 0 && !alertMuted && (
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleMuteAlert}
            className="animate-pulse"
          >
            <VolumeX className="h-4 w-4 mr-2" />
            Silenciar alarma
          </Button>
        )}
        {alertMuted && pendingRequests.length > 0 && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <VolumeX className="h-3 w-3" />
            Silenciada
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={testSound}>
          <Volume2 className="h-4 w-4 mr-2" />
          Probar sonido
        </Button>
      </div>

      {/* Viaje activo */}
      {activeTrip && (
        <>
          {/* Mapa pantalla completa */}
          {showFullscreenMap && (
            <TaxiLiveMap
              pickupLat={activeTrip.pickup_lat}
              pickupLng={activeTrip.pickup_lng}
              destinationLat={activeTrip.destination_lat}
              destinationLng={activeTrip.destination_lng}
              pickupAddress={activeTrip.pickup_address}
              destinationAddress={activeTrip.destination_address}
              isDriver={true}
              tripStatus="accepted"
              onClose={() => setShowFullscreenMap(false)}
            />
          )}

          <Card className="border-green-500 bg-green-500/10">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Viaje en curso
                </CardTitle>
                <Badge className="bg-yellow-500 text-yellow-950">🚕 Activo</Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Info del pasajero */}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="font-semibold">{activeTrip.passengerName}</span>
                {activeTrip.passengerPhone && (
                  <span className="text-muted-foreground">- {activeTrip.passengerPhone}</span>
                )}
              </div>

              {/* Botón para abrir mapa fullscreen */}
              <Button
                variant="default"
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                onClick={() => setShowFullscreenMap(true)}
              >
                <Maximize2 className="h-4 w-4 mr-2" />
                Ver mapa GPS en pantalla completa
              </Button>
              
              {/* Direcciones */}
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Recogida</p>
                    <p className="text-muted-foreground line-clamp-2">
                      {activeTrip.pickup_address || `${activeTrip.pickup_lat.toFixed(5)}, ${activeTrip.pickup_lng.toFixed(5)}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <Navigation className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Destino</p>
                    <p className="text-muted-foreground line-clamp-2">
                      {activeTrip.destination_address || `${activeTrip.destination_lat.toFixed(5)}, ${activeTrip.destination_lng.toFixed(5)}`}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Resumen económico */}
              <div className="bg-background p-3 rounded-lg border">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Distancia:</span>
                  <span className="font-medium">{activeTrip.distance_km.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <span className="font-semibold flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    Total a cobrar:
                  </span>
                  <span className="text-xl font-bold text-green-600">${activeTrip.total_fare.toFixed(2)} MXN</span>
                </div>
              </div>
              
              {/* Botón completar viaje */}
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleCompleteTrip}
                disabled={completingTrip}
              >
                {completingTrip ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />...</>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Completar Viaje
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Solicitudes pendientes */}
      {pendingRequests.length > 0 && (
        <>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Badge variant="destructive" className="animate-pulse">
              {pendingRequests.length}
            </Badge>
            Solicitudes pendientes
          </h2>
          
          {pendingRequests.map((request) => (
            <Card key={request.id} className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {request.passengerName}
                  </CardTitle>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(request.created_at)}
                  </Badge>
                </div>
                {request.passengerPhone && (
                  <p className="text-sm text-muted-foreground">{request.passengerPhone}</p>
                )}
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div 
                  id={`request-map-${request.id}`}
                  className="h-32 rounded-lg overflow-hidden"
                />
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Recogida</p>
                      <p className="text-muted-foreground line-clamp-2">
                        {request.pickup_address || `${request.pickup_lat.toFixed(5)}, ${request.pickup_lng.toFixed(5)}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Navigation className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Destino</p>
                      <p className="text-muted-foreground line-clamp-2">
                        {request.destination_address || `${request.destination_lat.toFixed(5)}, ${request.destination_lng.toFixed(5)}`}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-background p-3 rounded-lg border">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Distancia:</span>
                    <span className="font-medium">{request.distance_km.toFixed(2)} km</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Tarifa:</span>
                    <span className="font-medium">${request.tarifa_km.toFixed(2)}/km</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="font-semibold flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      Total a cobrar:
                    </span>
                    <span className="text-xl font-bold text-primary">${request.total_fare.toFixed(2)} MXN</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleReject(request.id)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Rechazar
                      </>
                    )}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => handleAccept(request.id)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Aceptar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Sin solicitudes ni viaje activo */}
      {!activeTrip && pendingRequests.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No hay solicitudes de taxi pendientes</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
