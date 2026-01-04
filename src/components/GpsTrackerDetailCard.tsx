import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Gauge, 
  Battery, 
  Clock, 
  Wifi, 
  WifiOff,
  Power,
  Shield,
  Route,
  BarChart3,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { GpsTracker } from '@/hooks/useGpsTrackers';
import { isGpsTrackerOnline } from '@/lib/gpsTrackers';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface GpsTrackerDetailCardProps {
  tracker: GpsTracker;
  isOwner: boolean;
  onCenterMap?: (lat: number, lng: number) => void;
  onShowRoute?: (trackerId: string) => void;
  onRemove?: () => void;
}

export const GpsTrackerDetailCard = ({ 
  tracker, 
  isOwner, 
  onCenterMap,
  onShowRoute,
  onRemove
}: GpsTrackerDetailCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [engineKillEnabled, setEngineKillEnabled] = useState(false);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const navigate = useNavigate();

  const isOnline = () => {
    return isGpsTrackerOnline(tracker.last_seen);
  };

  const getBatteryColor = (level: number | null) => {
    if (level === null) return 'text-muted-foreground';
    if (level > 50) return 'text-green-500';
    if (level > 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getBatteryIcon = (level: number | null) => {
    if (level === null) return 'bg-muted';
    if (level > 50) return 'bg-green-500';
    if (level > 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleEngineKill = () => {
    // TODO: Implementar comando SMS/GPRS al tracker
    setEngineKillEnabled(!engineKillEnabled);
  };

  const handleGeofence = () => {
    // TODO: Implementar configuración de geocerca
    setGeofenceEnabled(!geofenceEnabled);
  };

  const online = isOnline();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`transition-all ${isOpen ? 'ring-2 ring-primary/20' : ''} ${!tracker.is_active ? 'opacity-60' : ''}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {tracker.name}
                    <Badge variant={online ? 'default' : 'secondary'} className="text-xs">
                      {online ? 'Online' : 'Offline'}
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{tracker.model} • {tracker.imei}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {tracker.battery_level !== null && (
                  <div className={`flex items-center gap-1 ${getBatteryColor(tracker.battery_level)}`}>
                    <Battery className="h-4 w-4" />
                    <span className="text-sm font-medium">{tracker.battery_level}%</span>
                  </div>
                )}
                {tracker.speed !== undefined && tracker.speed > 0 && (
                  <div className="flex items-center gap-1 text-blue-500">
                    <Gauge className="h-4 w-4" />
                    <span className="text-sm font-medium">{tracker.speed.toFixed(0)} km/h</span>
                  </div>
                )}
                {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <Separator />

            {/* Información en vivo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <MapPin className="h-5 w-5 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Ubicación</p>
                {tracker.latitude && tracker.longitude ? (
                  <p className="text-xs font-mono">
                    {tracker.latitude.toFixed(4)}, {tracker.longitude.toFixed(4)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Gauge className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-xs text-muted-foreground">Velocidad</p>
                <p className="text-lg font-bold">
                  {tracker.speed !== undefined ? `${tracker.speed.toFixed(0)} km/h` : '-- km/h'}
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Battery className={`h-5 w-5 mx-auto mb-1 ${getBatteryColor(tracker.battery_level)}`} />
                <p className="text-xs text-muted-foreground">Batería</p>
                <p className="text-lg font-bold">
                  {tracker.battery_level !== null ? `${tracker.battery_level}%` : '--%'}
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-center">
                {online ? (
                  <Wifi className="h-5 w-5 mx-auto text-green-500 mb-1" />
                ) : (
                  <WifiOff className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                )}
                <p className="text-xs text-muted-foreground">Última conexión</p>
                <p className="text-xs">
                  {tracker.last_seen 
                    ? formatDistanceToNow(new Date(tracker.last_seen), { addSuffix: true, locale: es })
                    : 'Nunca'
                  }
                </p>
              </div>
            </div>

            {/* Controles (solo para dueño) */}
            {isOwner && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    Controles del Dispositivo
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Power className="h-4 w-4 text-red-500" />
                        <div>
                          <Label htmlFor="engine-kill" className="text-sm font-medium">Apagar Motor</Label>
                          <p className="text-xs text-muted-foreground">Corta el encendido del vehículo</p>
                        </div>
                      </div>
                      <Switch
                        id="engine-kill"
                        checked={engineKillEnabled}
                        onCheckedChange={handleEngineKill}
                        disabled={!online}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        <div>
                          <Label htmlFor="geofence" className="text-sm font-medium">Geocerca</Label>
                          <p className="text-xs text-muted-foreground">Alerta al salir del área</p>
                        </div>
                      </div>
                      <Switch
                        id="geofence"
                        checked={geofenceEnabled}
                        onCheckedChange={handleGeofence}
                      />
                    </div>
                  </div>

                  {!online && (
                    <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">Algunos controles requieren que el dispositivo esté en línea</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Botones de acción */}
            <Separator />
            <div className="flex flex-wrap gap-2">
              {tracker.latitude && tracker.longitude && onCenterMap && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onCenterMap(tracker.latitude!, tracker.longitude!)}
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Centrar en Mapa
                </Button>
              )}

              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onShowRoute?.(tracker.id)}
              >
                <Route className="h-4 w-4 mr-1" />
                Ver Ruta del Día
              </Button>

              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(`/gps-reports?tracker=${tracker.id}`)}
              >
                <BarChart3 className="h-4 w-4 mr-1" />
                Reportes Detallados
              </Button>

              {isOwner && onRemove && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50"
                  onClick={onRemove}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar Dispositivo
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default GpsTrackerDetailCard;
