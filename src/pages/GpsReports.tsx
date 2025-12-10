import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  CalendarIcon, 
  Download, 
  Route, 
  Gauge, 
  Clock,
  MapPin,
  AlertTriangle,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGpsTrackers, GpsTracker } from '@/hooks/useGpsTrackers';
import { useTrackingGroup } from '@/hooks/useTrackingGroup';
import { supabase } from '@/integrations/supabase/client';

interface LocationHistory {
  id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  altitude: number | null;
  updated_at: string;
}

const GpsReports = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const trackerId = searchParams.get('tracker');
  
  const { group } = useTrackingGroup();
  const { trackers, loading: trackersLoading } = useGpsTrackers(group?.id || null);
  
  const [selectedTracker, setSelectedTracker] = useState<string | null>(trackerId);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(),
    to: new Date()
  });
  const [locationHistory, setLocationHistory] = useState<LocationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalDistance: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    totalTime: 0,
    alerts: 0
  });

  const currentTracker = trackers.find(t => t.id === selectedTracker);

  useEffect(() => {
    if (selectedTracker && dateRange.from) {
      fetchLocationHistory();
    }
  }, [selectedTracker, dateRange]);

  const fetchLocationHistory = async () => {
    if (!selectedTracker) return;
    
    setLoading(true);
    try {
      // TODO: Crear tabla gps_tracker_history para almacenar historial
      // Por ahora usamos la tabla de ubicaciones actuales como ejemplo
      const { data, error } = await supabase
        .from('gps_tracker_locations')
        .select('*')
        .eq('tracker_id', selectedTracker)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setLocationHistory(data || []);
      
      // Calcular estadísticas
      if (data && data.length > 0) {
        const speeds = data.filter(d => d.speed !== null).map(d => d.speed!);
        setStats({
          totalDistance: calculateTotalDistance(data),
          maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
          avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
          totalTime: data.length > 1 
            ? (new Date(data[0].updated_at).getTime() - new Date(data[data.length - 1].updated_at).getTime()) / 1000 / 60 / 60
            : 0,
          alerts: 0 // TODO: Implementar alertas
        });
      }
    } catch (error) {
      console.error('Error fetching location history:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalDistance = (locations: LocationHistory[]): number => {
    let total = 0;
    for (let i = 1; i < locations.length; i++) {
      total += haversineDistance(
        locations[i - 1].latitude,
        locations[i - 1].longitude,
        locations[i].latitude,
        locations[i].longitude
      );
    }
    return total;
  };

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleExportCSV = () => {
    if (locationHistory.length === 0) return;

    const headers = ['Fecha/Hora', 'Latitud', 'Longitud', 'Velocidad (km/h)', 'Altitud (m)'];
    const rows = locationHistory.map(loc => [
      format(new Date(loc.updated_at), 'dd/MM/yyyy HH:mm:ss'),
      loc.latitude.toFixed(6),
      loc.longitude.toFixed(6),
      loc.speed?.toFixed(1) || '',
      loc.altitude?.toFixed(0) || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_gps_${currentTracker?.name || 'tracker'}_${format(dateRange.from, 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (trackersLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/tracking-gps')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al Tracking
          </Button>
          
          <Button variant="outline" onClick={handleExportCSV} disabled={locationHistory.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reportes GPS</h1>
            <p className="text-muted-foreground">Historial de recorridos, alertas y estadísticas</p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Dispositivo</label>
                <Select value={selectedTracker || ''} onValueChange={setSelectedTracker}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Seleccionar tracker" />
                  </SelectTrigger>
                  <SelectContent>
                    {trackers.map(tracker => (
                      <SelectItem key={tracker.id} value={tracker.id}>
                        {tracker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateRange.from, "PPP", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => date && setDateRange({ ...dateRange, from: date, to: date })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estadísticas */}
        {selectedTracker && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <Route className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-2xl font-bold">{stats.totalDistance.toFixed(1)} km</p>
                <p className="text-xs text-muted-foreground">Distancia Total</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Gauge className="h-6 w-6 mx-auto text-red-500 mb-2" />
                <p className="text-2xl font-bold">{stats.maxSpeed.toFixed(0)} km/h</p>
                <p className="text-xs text-muted-foreground">Velocidad Máxima</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <TrendingUp className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                <p className="text-2xl font-bold">{stats.avgSpeed.toFixed(0)} km/h</p>
                <p className="text-xs text-muted-foreground">Velocidad Promedio</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="h-6 w-6 mx-auto text-green-500 mb-2" />
                <p className="text-2xl font-bold">{stats.totalTime.toFixed(1)} hrs</p>
                <p className="text-xs text-muted-foreground">Tiempo en Movimiento</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <AlertTriangle className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
                <p className="text-2xl font-bold">{stats.alerts}</p>
                <p className="text-xs text-muted-foreground">Alertas</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Contenido principal */}
        {selectedTracker ? (
          <Tabs defaultValue="history" className="space-y-4">
            <TabsList>
              <TabsTrigger value="history">Historial de Ubicaciones</TabsTrigger>
              <TabsTrigger value="alerts">Alertas</TabsTrigger>
              <TabsTrigger value="geofences">Geocercas</TabsTrigger>
            </TabsList>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Registro de Ubicaciones
                  </CardTitle>
                  <CardDescription>
                    {locationHistory.length} puntos registrados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="animate-pulse space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-muted rounded"></div>
                      ))}
                    </div>
                  ) : locationHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No hay datos para la fecha seleccionada</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha/Hora</TableHead>
                            <TableHead>Latitud</TableHead>
                            <TableHead>Longitud</TableHead>
                            <TableHead>Velocidad</TableHead>
                            <TableHead>Altitud</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {locationHistory.map((loc) => (
                            <TableRow key={loc.id}>
                              <TableCell className="font-mono text-sm">
                                {format(new Date(loc.updated_at), 'dd/MM/yyyy HH:mm:ss')}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {loc.latitude.toFixed(6)}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {loc.longitude.toFixed(6)}
                              </TableCell>
                              <TableCell>
                                {loc.speed !== null ? (
                                  <Badge variant={loc.speed > 80 ? 'destructive' : 'secondary'}>
                                    {loc.speed.toFixed(0)} km/h
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">--</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {loc.altitude !== null ? `${loc.altitude.toFixed(0)} m` : '--'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Alertas
                  </CardTitle>
                  <CardDescription>
                    Alertas de velocidad, geocerca y batería baja
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay alertas registradas</p>
                    <p className="text-sm mt-2">Las alertas aparecerán cuando configures geocercas o límites de velocidad</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="geofences">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Geocercas Configuradas
                  </CardTitle>
                  <CardDescription>
                    Áreas de seguridad para alertas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay geocercas configuradas</p>
                    <Button variant="outline" className="mt-4">
                      Crear Geocerca
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecciona un dispositivo</h3>
              <p className="text-muted-foreground">
                Elige un rastreador GPS para ver sus reportes y estadísticas
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GpsReports;
