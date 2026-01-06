import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, DollarSign, Loader2, Clock, User, Car, Phone, X, CheckCircle2, Maximize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TaxiLiveMap from './TaxiLiveMap';

interface TripData {
  id: string;
  driver_id: string;
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
  driverName?: string;
  driverPhone?: string;
}

export default function PassengerActiveTrip() {
  const { toast } = useToast();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Cargar viaje activo del pasajero
  const fetchTrip = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('taxi_requests')
      .select('*')
      .eq('passenger_id', user.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error cargando viaje:', error);
      setLoading(false);
      return;
    }

    if (data) {
      // Obtener nombre del conductor
      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre, telefono')
        .eq('user_id', data.driver_id)
        .single();
      
      setTrip({
        ...data,
        driverName: profile?.nombre || 'Conductor',
        driverPhone: profile?.telefono || ''
      });
    } else {
      setTrip(null);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchTrip();

    // Suscripción en tiempo real
    const channel = supabase
      .channel('passenger-trip')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'taxi_requests'
        },
        (payload) => {
          // Si el viaje se completó o canceló, mostrar notificación
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newData = payload.new as any;
            if (newData.status === 'completed') {
              toast({
                title: "🎉 ¡Viaje completado!",
                description: "Gracias por usar nuestro servicio.",
              });
            } else if (newData.status === 'accepted' && trip?.status === 'pending') {
              toast({
                title: "🚕 ¡Conductor en camino!",
                description: "El taxi va hacia tu ubicación.",
              });
            }
          }
          fetchTrip();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Inicializar mapa
  useEffect(() => {
    if (!trip) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    const containerId = 'passenger-trip-map';
    const container = document.getElementById(containerId);
    
    if (container && !mapRef.current) {
      const map = L.map(container, {
        attributionControl: false,
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true
      }).setView([trip.pickup_lat, trip.pickup_lng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      L.marker([trip.pickup_lat, trip.pickup_lng], {
        icon: L.divIcon({
          html: '<div style="font-size: 24px;">📍</div>',
          className: 'pickup-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(map).bindPopup('Punto de recogida');

      L.marker([trip.destination_lat, trip.destination_lng], {
        icon: L.divIcon({
          html: '<div style="font-size: 24px;">🏁</div>',
          className: 'destination-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(map).bindPopup('Destino');

      const bounds = L.latLngBounds(
        [trip.pickup_lat, trip.pickup_lng],
        [trip.destination_lat, trip.destination_lng]
      );
      map.fitBounds(bounds, { padding: [30, 30] });

      mapRef.current = map;
    }
  }, [trip]);

  // Cancelar viaje
  const handleCancelTrip = async () => {
    if (!trip) return;
    
    setCancelling(true);
    
    try {
      const { error } = await supabase
        .from('taxi_requests')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', trip.id);

      if (error) throw error;

      toast({
        title: "Viaje cancelado",
        description: "Has cancelado tu solicitud de taxi.",
      });

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      setTrip(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar el viaje",
        variant: "destructive"
      });
    } finally {
      setCancelling(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return null;
  }

  const isPending = trip.status === 'pending';
  const isAccepted = trip.status === 'accepted';

  return (
    <>
      {/* Mapa pantalla completa */}
      {showFullscreenMap && trip && (
        <TaxiLiveMap
          pickupLat={trip.pickup_lat}
          pickupLng={trip.pickup_lng}
          destinationLat={trip.destination_lat}
          destinationLng={trip.destination_lng}
          pickupAddress={trip.pickup_address}
          destinationAddress={trip.destination_address}
          isDriver={false}
          tripStatus={trip.status as 'pending' | 'accepted'}
          onClose={() => setShowFullscreenMap(false)}
        />
      )}

      <Card className={`border-2 ${isAccepted ? 'border-yellow-500 bg-yellow-500/10' : 'border-muted bg-muted/10'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="h-5 w-5" />
              {isPending ? 'Esperando confirmación' : '🚕 Tu taxi viene en camino'}
            </CardTitle>
            <Badge className={isPending ? 'bg-muted-foreground' : 'bg-yellow-500 text-yellow-950'}>
              {isPending ? 'Pendiente' : '🚕 Confirmado'}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Info del conductor */}
          <div className="flex items-center justify-between bg-background p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="font-semibold">{trip.driverName}</span>
            </div>
            {trip.driverPhone && (
              <a 
                href={`tel:${trip.driverPhone}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="h-4 w-4" />
                Llamar
              </a>
            )}
          </div>

          {/* Status message */}
          {isPending && (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Esperando que el conductor acepte tu solicitud...</span>
            </div>
          )}
          
          {isAccepted && (
            <div className="flex items-center gap-2 text-yellow-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">¡El conductor está en camino! Aceptado: {formatTime(trip.accepted_at!)}</span>
            </div>
          )}

          {/* Mapa con botón fullscreen */}
          <div className="relative">
            <div 
              id="passenger-trip-map"
              className="h-40 rounded-lg overflow-hidden"
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 bg-background/80 shadow-lg z-[400]"
              onClick={() => setShowFullscreenMap(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Direcciones */}
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Recogida</p>
                <p className="text-muted-foreground line-clamp-2">
                  {trip.pickup_address || `${trip.pickup_lat.toFixed(5)}, ${trip.pickup_lng.toFixed(5)}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <Navigation className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Destino</p>
                <p className="text-muted-foreground line-clamp-2">
                  {trip.destination_address || `${trip.destination_lat.toFixed(5)}, ${trip.destination_lng.toFixed(5)}`}
                </p>
              </div>
            </div>
          </div>
          
          {/* Resumen económico */}
          <div className="bg-background p-3 rounded-lg border">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Distancia:</span>
              <span className="font-medium">{trip.distance_km.toFixed(2)} km</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t mt-2">
              <span className="font-semibold flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Tarifa estimada:
              </span>
              <span className="text-xl font-bold text-primary">${trip.total_fare.toFixed(2)} MXN</span>
            </div>
          </div>
          
          {/* Botones */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowFullscreenMap(true)}
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Ver mapa GPS
            </Button>
            
            {isPending && (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancelTrip}
                disabled={cancelling}
              >
                {cancelling ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />...</>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
