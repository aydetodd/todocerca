import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, DollarSign, Loader2, Check, X, Clock, User } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  passengerName?: string;
  passengerPhone?: string;
}

export default function TaxiDriverRequests() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<TaxiRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const mapRefs = useRef<{ [key: string]: L.Map }>({});

  // Cargar solicitudes pendientes
  const fetchRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

    setRequests(requestsWithNames);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();

    // Suscripción en tiempo real
    const channel = supabase
      .channel('taxi-requests-driver')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'taxi_requests'
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Limpiar mapas
      Object.values(mapRefs.current).forEach(map => map.remove());
    };
  }, []);

  // Inicializar mapas cuando cambian las solicitudes
  useEffect(() => {
    requests.forEach((req) => {
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

        // Marcador de recogida
        L.marker([req.pickup_lat, req.pickup_lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 20px;">📍</div>',
            className: 'pickup-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(map);

        // Marcador de destino
        L.marker([req.destination_lat, req.destination_lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 20px;">🏁</div>',
            className: 'destination-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(map);

        // Ajustar vista para mostrar ambos puntos
        const bounds = L.latLngBounds(
          [req.pickup_lat, req.pickup_lng],
          [req.destination_lat, req.destination_lng]
        );
        map.fitBounds(bounds, { padding: [20, 20] });

        mapRefs.current[req.id] = map;
      }
    });
  }, [requests]);

  // Aceptar solicitud
  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId);
    
    try {
      const { error } = await supabase
        .from('taxi_requests')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: "¡Solicitud aceptada!",
        description: "El pasajero ha sido notificado. Ve al punto de recogida.",
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>No hay solicitudes de taxi pendientes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Badge variant="destructive" className="animate-pulse">
          {requests.length}
        </Badge>
        Solicitudes pendientes
      </h2>
      
      {requests.map((request) => (
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
            {/* Mapa pequeño */}
            <div 
              id={`request-map-${request.id}`}
              className="h-32 rounded-lg overflow-hidden"
            />
            
            {/* Direcciones */}
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
            
            {/* Resumen económico */}
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
            
            {/* Botones de acción */}
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
    </div>
  );
}
