import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation, Car, DollarSign, Loader2, Check, Target, Search, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

// Buscar direcciones por texto
async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TodoCerca-App' }
    });
    const data = await response.json();
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      display_name: item.display_name
    }));
  } catch {
    return [];
  }
}

export default function TaxiRequestModal({ isOpen, onClose, driver }: TaxiRequestModalProps) {
  const { toast } = useToast();
  const miniMapRef = useRef<L.Map | null>(null);
  const fullMapRef = useRef<L.Map | null>(null);
  const miniMapContainerRef = useRef<HTMLDivElement>(null);
  const fullMapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destinationCoords, setDestinationCoords] = useState<AddressSuggestion | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  const [routeInfo, setRouteInfo] = useState<{
    driverToPickup: RouteInfo | null;
    pickupToDestination: RouteInfo | null;
    totalKm: number;
    totalFare: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [centerAddress, setCenterAddress] = useState<string>('');
  const [loadingCenterAddress, setLoadingCenterAddress] = useState(false);
  const [tarifaKm, setTarifaKm] = useState<number>(driver.tarifa_km || 15);
  
  // Búsqueda de dirección
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  
  // Obtener precio del producto taxi del proveedor
  useEffect(() => {
    const fetchTaxiPrice = async () => {
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', driver.user_id)
        .single();
      
      if (proveedor) {
        const { data: producto } = await supabase
          .from('productos')
          .select('precio')
          .eq('proveedor_id', proveedor.id)
          .ilike('nombre', '%taxi%')
          .single();
        
        if (producto) {
          setTarifaKm(producto.precio);
        }
      }
    };
    
    if (isOpen) {
      fetchTaxiPrice();
    }
  }, [isOpen, driver.user_id]);
  
  // Obtener ubicación del usuario automáticamente
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

  // Inicializar mapa mini (vista previa)
  useEffect(() => {
    if (!isOpen || !miniMapContainerRef.current || miniMapRef.current || selectionMode !== 'none') return;
    
    const timer = setTimeout(() => {
      if (!miniMapContainerRef.current) return;
      
      const map = L.map(miniMapContainerRef.current, { 
        attributionControl: false,
        zoomControl: false
      }).setView([driver.latitude, driver.longitude], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      miniMapRef.current = map;
      
      // Marcador del taxi
      L.marker([driver.latitude, driver.longitude], {
        icon: L.divIcon({
          html: '<div style="font-size: 24px;">🚕</div>',
          className: 'taxi-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(map);
      
      setTimeout(() => map.invalidateSize(), 100);
    }, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, driver.latitude, driver.longitude, selectionMode]);
  
  // Limpiar mapa mini al cerrar o cambiar modo
  useEffect(() => {
    if (!isOpen || selectionMode !== 'none') {
      if (miniMapRef.current) {
        miniMapRef.current.remove();
        miniMapRef.current = null;
      }
    }
  }, [isOpen, selectionMode]);

  // Inicializar mapa fullscreen para selección
  useEffect(() => {
    if (selectionMode === 'none' || !fullMapContainerRef.current) return;
    
    // Limpiar mapa anterior si existe
    if (fullMapRef.current) {
      fullMapRef.current.remove();
      fullMapRef.current = null;
    }
    
    const timer = setTimeout(() => {
      if (!fullMapContainerRef.current) return;
      
      // Determinar centro inicial
      let initialCenter: [number, number] = [driver.latitude, driver.longitude];
      if (selectionMode === 'pickup' && pickupCoords) {
        initialCenter = [pickupCoords.lat, pickupCoords.lng];
      } else if (selectionMode === 'destination') {
        if (destinationCoords) {
          initialCenter = [destinationCoords.lat, destinationCoords.lng];
        } else if (pickupCoords) {
          initialCenter = [pickupCoords.lat, pickupCoords.lng];
        }
      }
      
      const map = L.map(fullMapContainerRef.current, { 
        attributionControl: false,
        zoomControl: true
      }).setView(initialCenter, 16);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      fullMapRef.current = map;
      
      // Evento moveend para actualizar dirección
      const handleMoveEnd = async () => {
        const center = map.getCenter();
        setLoadingCenterAddress(true);
        const address = await reverseGeocode(center.lat, center.lng);
        setCenterAddress(address);
        setLoadingCenterAddress(false);
      };
      
      map.on('moveend', handleMoveEnd);
      handleMoveEnd(); // Obtener dirección inicial
      
      setTimeout(() => map.invalidateSize(), 100);
    }, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, [selectionMode, driver.latitude, driver.longitude]);
  
  // Limpiar mapa fullscreen al salir del modo selección
  useEffect(() => {
    if (selectionMode === 'none' && fullMapRef.current) {
      fullMapRef.current.remove();
      fullMapRef.current = null;
    }
  }, [selectionMode]);

  // Confirmar selección del centro del mapa
  const confirmCenterSelection = useCallback(async () => {
    const center = fullMapRef.current?.getCenter();
    if (!center) return;
    
    const coords = { lat: center.lat, lng: center.lng };
    const address = centerAddress || await reverseGeocode(center.lat, center.lng);
    
    if (selectionMode === 'pickup') {
      setPickupCoords(coords);
      setPickupAddress(address);
      
      // Recalcular ruta si ya hay destino
      if (destinationCoords) {
        await calculateFullRoute(coords, destinationCoords);
      }
    } else if (selectionMode === 'destination') {
      const dest = { lat: coords.lat, lng: coords.lng, display_name: address };
      setDestinationCoords(dest);
      
      // Calcular ruta
      if (pickupCoords) {
        await calculateFullRoute(pickupCoords, dest);
      }
    }
    
    setSelectionMode('none');
    setCenterAddress('');
  }, [selectionMode, centerAddress, destinationCoords, pickupCoords]);

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
      setDestinationCoords(null);
      setRouteInfo(null);
      setSelectionMode('none');
      setPickupCoords(null);
      setPickupAddress('');
      setCenterAddress('');
      setSearchQuery('');
      setSearchResults([]);
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }
    }
  }, [isOpen]);

  // Iniciar modo selección de pickup
  const startPickupSelection = () => {
    setSelectionMode('pickup');
  };

  // Iniciar modo selección de destino
  const startDestinationSelection = () => {
    setSelectionMode('destination');
  };
  
  // Buscar direcciones
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;
    
    setSearchingAddress(true);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setSearchingAddress(false);
  };
  
  // Seleccionar resultado de búsqueda y ir al mapa para ajustar
  const selectSearchResult = (result: AddressSuggestion) => {
    setSearchResults([]);
    setSearchQuery('');
    // Ir al mapa para ajustar la ubicación exacta
    if (fullMapRef.current) {
      fullMapRef.current.setView([result.lat, result.lng], 17);
    }
    setCenterAddress(result.display_name);
  };

  // Renderizar mapa fullscreen usando portal para estar encima de todo
  const fullscreenMap = selectionMode !== 'none' ? createPortal(
    <div className="fixed inset-0 bg-background flex flex-col" style={{ zIndex: 99999 }}>
      <div className="relative flex-1">
        <div 
          ref={fullMapContainerRef} 
          className="absolute inset-0 w-full h-full"
        />
        
        {/* Crosshair - líneas cruzadas en el centro */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-primary/70 pointer-events-none z-[1000]" />
        <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-full bg-primary/70 pointer-events-none z-[1000]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border-2 border-primary bg-primary/20 rounded-full pointer-events-none z-[1000]" />
        
        {/* Instrucción arriba */}
        <div className="absolute top-4 left-4 right-4 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg text-center z-[1001]">
          {selectionMode === 'pickup' ? 'Mueve el mapa para seleccionar punto de recogida' : 'Mueve el mapa para seleccionar destino'}
        </div>
        
        {/* Búsqueda de dirección (solo para destino) */}
        {selectionMode === 'destination' && (
          <div className="absolute top-16 left-4 right-4 z-[1001] space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar dirección... ej: Autozone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchAddress()}
                className="flex-1 bg-background/95"
              />
              <Button 
                onClick={handleSearchAddress} 
                size="icon"
                disabled={searchingAddress}
              >
                {searchingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Resultados de búsqueda */}
            {searchResults.length > 0 && (
              <div className="bg-background/95 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((result, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectSearchResult(result)}
                    className="p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50"
                  >
                    <p className="text-sm line-clamp-2">{result.display_name}</p>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchResults([])}
                  className="w-full"
                >
                  <X className="h-4 w-4 mr-1" /> Cerrar resultados
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* Dirección del centro y botones */}
        <div className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur p-4 rounded-lg z-[1001] space-y-3 shadow-lg">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary flex-shrink-0" />
            {loadingCenterAddress ? (
              <span className="text-sm text-muted-foreground">Cargando dirección...</span>
            ) : (
              <span className="line-clamp-2 flex-1 text-sm">{centerAddress || 'Mueve el mapa...'}</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setSelectionMode('none');
                setCenterAddress('');
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmCenterSelection}
              disabled={loadingCenterAddress}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // Render principal
  return (
    <>
      {/* Mapa pantalla completa usando portal */}
      {fullscreenMap}
      
      {/* Dialog principal */}
      <Dialog open={isOpen && selectionMode === 'none'} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Solicitar Taxi
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 px-4">
            {/* Info del taxista */}
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-semibold">{driver.business_name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Tarifa: ${tarifaKm.toFixed(2)} MXN/km
              </p>
            </div>
            
            {/* Mapa mini preview - solo se muestra cuando no está en modo selección */}
            {selectionMode === 'none' && (
              <div 
                ref={miniMapContainerRef} 
                className="h-48 rounded-lg border overflow-hidden"
              />
            )}
            
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
                <div 
                  onClick={startPickupSelection}
                  className="bg-muted/50 p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="line-clamp-2 flex-1 text-sm">{pickupAddress || 'Ubicación seleccionada'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Toca para cambiar (por si el taxi es para otra persona)</p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startPickupSelection}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Seleccionar punto de recogida
                </Button>
              )}
            </div>
            
            {/* Destino */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Navigation className="h-4 w-4 text-green-600" />
                Destino
              </Label>
              {destinationCoords ? (
                <div 
                  onClick={startDestinationSelection}
                  className="bg-green-500/10 p-3 rounded-lg cursor-pointer hover:bg-green-500/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="line-clamp-2 flex-1 text-sm">{destinationCoords.display_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Toca para cambiar</p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startDestinationSelection}
                  className="w-full"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Seleccionar destino en el mapa
                </Button>
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
          
          <DialogFooter className="gap-2 p-4 pt-2">
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
    </>
  );
}
