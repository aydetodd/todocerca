import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, Car, DollarSign, Loader2 } from 'lucide-react';
import L from 'leaflet';

interface TaxiRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: {
    user_id: string;
    business_name: string;
    latitude: number;
    longitude: number;
    tarifa_km?: number;
  };
}

interface RouteInfo {
  distance_km: number;
  duration_min: number;
  geometry: [number, number][];
}

// Función para calcular ruta usando OSRM
async function calculateRoute(
  startLat: number, 
  startLng: number, 
  endLat: number, 
  endLng: number
): Promise<RouteInfo | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes?.[0]) {
      const route = data.routes[0];
      return {
        distance_km: route.distance / 1000, // metros a km
        duration_min: route.duration / 60,  // segundos a minutos
        geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]) // swap lng,lat to lat,lng
      };
    }
    return null;
  } catch (error) {
    console.error('Error calculando ruta:', error);
    return null;
  }
}

// Buscar dirección con Nominatim
async function searchAddress(query: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=mx`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TodoCerca-App' }
    });
    const data = await response.json();
    
    if (data?.[0]) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error('Error buscando dirección:', error);
    return null;
  }
}

export default function TaxiRequestModal({ isOpen, onClose, driver }: TaxiRequestModalProps) {
  const { toast } = useToast();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number; display_name: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    driverToPickup: RouteInfo | null;
    pickupToDestination: RouteInfo | null;
    totalKm: number;
    totalFare: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const tarifaKm = driver.tarifa_km || 15;
  
  // Obtener ubicación del usuario
  useEffect(() => {
    if (isOpen && !userLocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLoading(false);
        },
        (err) => {
          console.error('Error obteniendo ubicación:', err);
          toast({
            title: "Error de ubicación",
            description: "No pudimos obtener tu ubicación. Verifica los permisos.",
            variant: "destructive"
          });
          setLoading(false);
        },
        { enableHighAccuracy: true }
      );
    }
  }, [isOpen]);

  // Inicializar mapa mini
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current || mapRef.current) return;
    
    const map = L.map(mapContainerRef.current, { 
      attributionControl: false,
      zoomControl: false
    }).setView([driver.latitude, driver.longitude], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;
    
    // Marcador del taxi
    const taxiMarker = L.marker([driver.latitude, driver.longitude], {
      icon: L.divIcon({
        html: '<div style="font-size: 24px;">🚕</div>',
        className: 'taxi-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map);
    markersRef.current.push(taxiMarker);
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
      }
    };
  }, [isOpen]);

  // Actualizar mapa con ubicación del usuario
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    
    // Agregar marcador de usuario
    const userMarker = L.marker([userLocation.lat, userLocation.lng], {
      icon: L.divIcon({
        html: '<div style="font-size: 24px;">📍</div>',
        className: 'user-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(mapRef.current);
    markersRef.current.push(userMarker);
    
    // Ajustar vista
    const bounds = L.latLngBounds([
      [driver.latitude, driver.longitude],
      [userLocation.lat, userLocation.lng]
    ]);
    mapRef.current.fitBounds(bounds, { padding: [30, 30] });
  }, [userLocation]);

  // Buscar destino
  const handleSearchDestination = async () => {
    if (!destination.trim()) return;
    
    setSearching(true);
    const result = await searchAddress(destination);
    
    if (result) {
      setDestinationCoords(result);
      
      // Agregar marcador de destino
      if (mapRef.current) {
        const destMarker = L.marker([result.lat, result.lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 24px;">🏁</div>',
            className: 'dest-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(mapRef.current);
        markersRef.current.push(destMarker);
      }
      
      // Calcular ruta completa
      if (userLocation) {
        await calculateFullRoute(result);
      }
    } else {
      toast({
        title: "Destino no encontrado",
        description: "Intenta con una dirección más específica",
        variant: "destructive"
      });
    }
    setSearching(false);
  };

  // Calcular ruta completa: taxi → usuario → destino
  const calculateFullRoute = async (dest: { lat: number; lng: number }) => {
    if (!userLocation) return;
    
    setLoading(true);
    
    // Ruta 1: Taxi → Usuario (punto de recogida)
    const driverToPickup = await calculateRoute(
      driver.latitude, driver.longitude,
      userLocation.lat, userLocation.lng
    );
    
    // Ruta 2: Usuario → Destino
    const pickupToDestination = await calculateRoute(
      userLocation.lat, userLocation.lng,
      dest.lat, dest.lng
    );
    
    if (driverToPickup && pickupToDestination) {
      const totalKm = driverToPickup.distance_km + pickupToDestination.distance_km;
      const totalFare = totalKm * tarifaKm;
      
      setRouteInfo({
        driverToPickup,
        pickupToDestination,
        totalKm,
        totalFare
      });
      
      // Dibujar ruta en el mapa
      if (mapRef.current) {
        // Limpiar ruta anterior
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        
        // Dibujar nueva ruta (ambos segmentos)
        const fullGeometry = [
          ...driverToPickup.geometry,
          ...pickupToDestination.geometry
        ];
        
        routeLayerRef.current = L.polyline(fullGeometry, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.8
        }).addTo(mapRef.current);
        
        // Ajustar vista para mostrar toda la ruta
        mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [30, 30] });
      }
    } else {
      toast({
        title: "Error calculando ruta",
        description: "No pudimos calcular la ruta. Verifica las direcciones.",
        variant: "destructive"
      });
    }
    
    setLoading(false);
  };

  // Enviar solicitud
  const handleSubmitRequest = async () => {
    if (!userLocation || !destinationCoords || !routeInfo) return;
    
    setSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "No autenticado",
          description: "Inicia sesión para solicitar un taxi",
          variant: "destructive"
        });
        return;
      }
      
      const { error } = await supabase
        .from('taxi_requests')
        .insert({
          passenger_id: user.id,
          driver_id: driver.user_id,
          pickup_lat: userLocation.lat,
          pickup_lng: userLocation.lng,
          destination_lat: destinationCoords.lat,
          destination_lng: destinationCoords.lng,
          destination_address: destinationCoords.display_name,
          driver_start_lat: driver.latitude,
          driver_start_lng: driver.longitude,
          distance_km: routeInfo.totalKm,
          tarifa_km: tarifaKm,
          total_fare: routeInfo.totalFare,
          status: 'pending'
        });
      
      if (error) throw error;
      
      toast({
        title: "¡Solicitud enviada!",
        description: `Se ha notificado a ${driver.business_name}. Kilometraje: ${routeInfo.totalKm.toFixed(2)} km`,
      });
      
      onClose();
    } catch (error: any) {
      console.error('Error enviando solicitud:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar la solicitud",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDestination('');
      setDestinationCoords(null);
      setRouteInfo(null);
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Solicitar Taxi
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Info del taxista */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="font-semibold">{driver.business_name}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Tarifa: ${tarifaKm.toFixed(2)} MXN/km
            </p>
          </div>
          
          {/* Mini mapa */}
          <div 
            ref={mapContainerRef} 
            className="h-40 rounded-lg border overflow-hidden"
          />
          
          {/* Ubicación del usuario */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-primary" />
              Tu ubicación (recogida)
            </Label>
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Obteniendo ubicación...
              </p>
            ) : userLocation ? (
              <p className="text-sm text-muted-foreground">
                {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
              </p>
            ) : (
              <p className="text-sm text-destructive">No se pudo obtener ubicación</p>
            )}
          </div>
          
          {/* Destino */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Navigation className="h-4 w-4 text-green-600" />
              Destino
            </Label>
            <div className="flex gap-2">
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Ingresa tu destino..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearchDestination()}
              />
              <Button 
                onClick={handleSearchDestination} 
                disabled={searching || !destination.trim()}
                size="sm"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
              </Button>
            </div>
            {destinationCoords && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {destinationCoords.display_name}
              </p>
            )}
          </div>
          
          {/* Resumen de ruta */}
          {routeInfo && (
            <div className="bg-primary/10 p-4 rounded-lg space-y-2 border border-primary/20">
              <h4 className="font-semibold text-primary">Resumen del viaje</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Taxi → Recogida</p>
                  <p className="font-medium">{routeInfo.driverToPickup?.distance_km.toFixed(2)} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recogida → Destino</p>
                  <p className="font-medium">{routeInfo.pickupToDestination?.distance_km.toFixed(2)} km</p>
                </div>
              </div>
              <div className="pt-2 border-t border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Distancia total:</span>
                  <span className="font-bold text-lg">{routeInfo.totalKm.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between items-center text-primary">
                  <span className="font-semibold">Tarifa estimada:</span>
                  <span className="font-bold text-xl">${routeInfo.totalFare.toFixed(2)} MXN</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmitRequest}
            disabled={!routeInfo || submitting}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
            ) : (
              <>Solicitar Taxi</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
