import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, Car, DollarSign, Loader2, Map, Check, Edit2 } from 'lucide-react';
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

interface AddressSuggestion {
  lat: number;
  lng: number;
  display_name: string;
}

type SelectionMode = 'none' | 'pickup' | 'destination';

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
        distance_km: route.distance / 1000,
        duration_min: route.duration / 60,
        geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
      };
    }
    return null;
  } catch (error) {
    console.error('Error calculando ruta:', error);
    return null;
  }
}

// Buscar direcciones con Nominatim (múltiples resultados)
async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=mx`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TodoCerca-App' }
    });
    const data = await response.json();
    
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      display_name: item.display_name
    }));
  } catch (error) {
    console.error('Error buscando direcciones:', error);
    return [];
  }
}

// Reverse geocoding
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TodoCerca-App' }
    });
    const data = await response.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export default function TaxiRequestModal({ isOpen, onClose, driver }: TaxiRequestModalProps) {
  const { toast } = useToast();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const taxiMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<AddressSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
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
    if (isOpen && !pickupCoords) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPickupCoords(coords);
          const address = await reverseGeocode(coords.lat, coords.lng);
          setPickupAddress(address);
          setLoading(false);
        },
        (err) => {
          console.error('Error obteniendo ubicación:', err);
          toast({
            title: "Error de ubicación",
            description: "No pudimos obtener tu ubicación. Selecciona el punto de recogida en el mapa.",
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
      zoomControl: true
    }).setView([driver.latitude, driver.longitude], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;
    
    // Marcador del taxi
    taxiMarkerRef.current = L.marker([driver.latitude, driver.longitude], {
      icon: L.divIcon({
        html: '<div style="font-size: 24px;">🚕</div>',
        className: 'taxi-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map);
    
    // Click en mapa para seleccionar origen o destino
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const address = await reverseGeocode(lat, lng);
      
      if (selectionMode === 'pickup') {
        selectPickup({ lat, lng }, address);
        setSelectionMode('none');
      } else if (selectionMode === 'destination') {
        selectDestination({ lat, lng, display_name: address });
        setSelectionMode('none');
      }
    });
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        taxiMarkerRef.current = null;
        pickupMarkerRef.current = null;
        destMarkerRef.current = null;
      }
    };
  }, [isOpen]);

  // Actualizar marcador de recogida
  useEffect(() => {
    if (!mapRef.current || !pickupCoords) return;
    
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.setLatLng([pickupCoords.lat, pickupCoords.lng]);
    } else {
      pickupMarkerRef.current = L.marker([pickupCoords.lat, pickupCoords.lng], {
        icon: L.divIcon({
          html: '<div style="font-size: 24px;">📍</div>',
          className: 'pickup-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(mapRef.current);
    }
    
    // Ajustar vista
    const bounds = L.latLngBounds([
      [driver.latitude, driver.longitude],
      [pickupCoords.lat, pickupCoords.lng]
    ]);
    if (destinationCoords) {
      bounds.extend([destinationCoords.lat, destinationCoords.lng]);
    }
    mapRef.current.fitBounds(bounds, { padding: [30, 30] });
  }, [pickupCoords, driver.latitude, driver.longitude]);

  // Buscar sugerencias mientras escribe
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (destination.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAddresses(destination);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSearching(false);
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [destination]);

  // Seleccionar punto de recogida
  const selectPickup = useCallback(async (coords: { lat: number; lng: number }, address: string) => {
    setPickupCoords(coords);
    setPickupAddress(address);
    
    // Recalcular ruta si ya hay destino
    if (destinationCoords) {
      await calculateFullRoute(coords, destinationCoords);
    }
  }, [destinationCoords]);

  // Seleccionar destino de la lista o mapa
  const selectDestination = useCallback(async (dest: AddressSuggestion) => {
    setDestinationCoords(dest);
    setDestination(dest.display_name.split(',')[0]);
    setShowSuggestions(false);
    
    // Actualizar marcador de destino
    if (mapRef.current) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng([dest.lat, dest.lng]);
      } else {
        destMarkerRef.current = L.marker([dest.lat, dest.lng], {
          icon: L.divIcon({
            html: '<div style="font-size: 24px;">🏁</div>',
            className: 'dest-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(mapRef.current);
      }
      
      // Ajustar vista
      if (pickupCoords) {
        const bounds = L.latLngBounds([
          [driver.latitude, driver.longitude],
          [pickupCoords.lat, pickupCoords.lng],
          [dest.lat, dest.lng]
        ]);
        mapRef.current.fitBounds(bounds, { padding: [30, 30] });
      }
    }
    
    // Calcular ruta
    if (pickupCoords) {
      await calculateFullRoute(pickupCoords, dest);
    }
  }, [pickupCoords, driver.latitude, driver.longitude]);

  // Calcular ruta completa: taxi → usuario → destino
  const calculateFullRoute = async (pickup: { lat: number; lng: number }, dest: { lat: number; lng: number }) => {
    setLoading(true);
    
    const driverToPickup = await calculateRoute(
      driver.latitude, driver.longitude,
      pickup.lat, pickup.lng
    );
    
    const pickupToDestination = await calculateRoute(
      pickup.lat, pickup.lng,
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
      
      if (mapRef.current) {
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        
        const fullGeometry = [
          ...driverToPickup.geometry,
          ...pickupToDestination.geometry
        ];
        
        routeLayerRef.current = L.polyline(fullGeometry, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.8
        }).addTo(mapRef.current);
        
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
    if (!pickupCoords || !destinationCoords || !routeInfo) return;
    
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
          pickup_lat: pickupCoords.lat,
          pickup_lng: pickupCoords.lng,
          pickup_address: pickupAddress,
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
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectionMode('none');
      setPickupCoords(null);
      setPickupAddress('');
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.remove();
        pickupMarkerRef.current = null;
      }
    }
  }, [isOpen]);

  const getSelectionModeLabel = () => {
    switch (selectionMode) {
      case 'pickup': return 'Toca el mapa para seleccionar punto de recogida';
      case 'destination': return 'Toca el mapa para seleccionar destino';
      default: return null;
    }
  };

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
          <div className="relative">
            <div 
              ref={mapContainerRef} 
              className={`h-56 rounded-lg border overflow-hidden ${selectionMode !== 'none' ? 'ring-2 ring-primary' : ''}`}
            />
            {selectionMode !== 'none' && (
              <div className="absolute top-2 left-2 right-2 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded-lg text-center">
                {getSelectionModeLabel()}
              </div>
            )}
          </div>
          
          {/* Punto de recogida */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-primary" />
              Punto de recogida
            </Label>
            {loading && !pickupCoords ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Obteniendo tu ubicación...
              </p>
            ) : pickupCoords ? (
              <div className="bg-muted/50 p-2 rounded text-sm flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span className="line-clamp-2 flex-1 text-muted-foreground">{pickupAddress || 'Ubicación seleccionada'}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => setSelectionMode(selectionMode === 'pickup' ? 'none' : 'pickup')}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectionMode('pickup')}
                className="w-full"
              >
                <Map className="h-4 w-4 mr-2" />
                Seleccionar en el mapa
              </Button>
            )}
          </div>
          
          {/* Destino */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Navigation className="h-4 w-4 text-green-600" />
              Destino
            </Label>
            <div className="relative">
              <Input
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestinationCoords(null);
                }}
                placeholder="Escribe tu destino..."
                className="pr-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              
              {/* Lista de sugerencias */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => selectDestination(suggestion)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 transition-colors"
                    >
                      <span className="line-clamp-2">{suggestion.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Botón seleccionar destino en mapa */}
            <Button
              variant={selectionMode === 'destination' ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectionMode(selectionMode === 'destination' ? 'none' : 'destination')}
              className="w-full"
            >
              <Map className="h-4 w-4 mr-2" />
              {selectionMode === 'destination' ? 'Cancelar selección' : 'Seleccionar destino en el mapa'}
            </Button>
            
            {destinationCoords && (
              <div className="bg-green-500/10 text-green-700 dark:text-green-400 p-2 rounded text-xs flex items-center gap-2">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span className="line-clamp-2">{destinationCoords.display_name}</span>
              </div>
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
            disabled={!routeInfo || submitting || !pickupCoords}
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
