import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Radio, Plus, Trash2, MapPin, Battery, Clock, Wifi, WifiOff } from 'lucide-react';
import { useGpsTrackers, GpsTracker } from '@/hooks/useGpsTrackers';
import { isGpsTrackerOnline } from '@/lib/gpsTrackers';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface GpsTrackerManagementProps {
  groupId: string | null;
  isOwner: boolean;
}

const GPS_MODELS = [
  { value: 'GT06', label: 'GT06 (Estándar)' },
  { value: 'KS199A', label: 'KS199A (Vehículos)' },
  { value: 'KS300', label: 'KS300 (Portátil)' },
];

export const GpsTrackerManagement = ({ groupId, isOwner }: GpsTrackerManagementProps) => {
  const { trackers, loading, addTracker, removeTracker, toggleTrackerActive } = useGpsTrackers(groupId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTrackerImei, setNewTrackerImei] = useState('');
  const [newTrackerName, setNewTrackerName] = useState('');
  const [newTrackerModel, setNewTrackerModel] = useState('GT06');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTracker = async () => {
    if (!newTrackerImei.trim() || !newTrackerName.trim()) return;
    
    setIsAdding(true);
    const success = await addTracker(newTrackerImei, newTrackerName, newTrackerModel);
    setIsAdding(false);
    
    if (success) {
      setNewTrackerImei('');
      setNewTrackerName('');
      setNewTrackerModel('GT06');
      setShowAddDialog(false);
    }
  };

  const getBatteryColor = (level: number | null) => {
    if (level === null) return 'text-muted-foreground';
    if (level > 50) return 'text-green-500';
    if (level > 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  const isOnline = (lastSeen: string | null) => {
    return isGpsTrackerOnline(lastSeen);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Rastreadores GPS
            </CardTitle>
            <CardDescription>
              Dispositivos GPS físicos vinculados al grupo
            </CardDescription>
          </div>
          {isOwner && (
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Rastreador GPS</DialogTitle>
                  <DialogDescription>
                    Ingresa el IMEI del dispositivo. Lo encontrarás en la etiqueta del rastreador o en la caja.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="tracker-imei">IMEI del dispositivo</Label>
                    <Input
                      id="tracker-imei"
                      value={newTrackerImei}
                      onChange={(e) => setNewTrackerImei(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej: 123456789012345"
                      maxLength={15}
                    />
                    <p className="text-xs text-muted-foreground">
                      15 dígitos que identifican únicamente al dispositivo
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tracker-name">Nombre del rastreador</Label>
                    <Input
                      id="tracker-name"
                      value={newTrackerName}
                      onChange={(e) => setNewTrackerName(e.target.value)}
                      placeholder="Ej: Auto de Papá, Moto, Bicicleta..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tracker-model">Modelo</Label>
                    <Select value={newTrackerModel} onValueChange={setNewTrackerModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GPS_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <Button 
                    onClick={handleAddTracker} 
                    className="w-full"
                    disabled={!newTrackerImei.trim() || !newTrackerName.trim() || isAdding}
                  >
                    {isAdding ? 'Registrando...' : 'Registrar Rastreador'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {trackers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay rastreadores GPS registrados</p>
            {isOwner && (
              <p className="text-sm mt-2">
                Haz clic en "Agregar" para vincular un dispositivo
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {trackers.map((tracker) => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                isOwner={isOwner}
                isOnline={isOnline(tracker.last_seen)}
                getBatteryColor={getBatteryColor}
                onRemove={() => removeTracker(tracker.id)}
                onToggle={() => toggleTrackerActive(tracker.id, !tracker.is_active)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface TrackerCardProps {
  tracker: GpsTracker;
  isOwner: boolean;
  isOnline: boolean;
  getBatteryColor: (level: number | null) => string;
  onRemove: () => void;
  onToggle: () => void;
}

const TrackerCard = ({ tracker, isOwner, isOnline, getBatteryColor, onRemove, onToggle }: TrackerCardProps) => {
  return (
    <div className={`border rounded-lg p-4 ${!tracker.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tracker.name}</span>
            <Badge variant={isOnline ? 'default' : 'secondary'} className="text-xs">
              {isOnline ? (
                <>
                  <Wifi className="h-3 w-3 mr-1" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  Offline
                </>
              )}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p>IMEI: {tracker.imei} • {tracker.model}</p>
            <div className="flex items-center gap-3">
              {tracker.battery_level !== null && (
                <span className={`flex items-center gap-1 ${getBatteryColor(tracker.battery_level)}`}>
                  <Battery className="h-3 w-3" />
                  {tracker.battery_level}%
                </span>
              )}
              {tracker.last_seen && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(tracker.last_seen), { addSuffix: true, locale: es })}
                </span>
              )}
            </div>
            {tracker.latitude && tracker.longitude && (
              <p className="flex items-center gap-1 text-xs">
                <MapPin className="h-3 w-3" />
                {tracker.latitude.toFixed(6)}, {tracker.longitude.toFixed(6)}
              </p>
            )}
          </div>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default GpsTrackerManagement;
