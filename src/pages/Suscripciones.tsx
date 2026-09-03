import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';
import {
  Calendar,
  Bus,
  Satellite,
  Building2,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';

interface SubItem {
  key: string;
  titulo: string;
  descripcion: string;
  precio: string;
  icon: any;
  activa: boolean;
  detalle: string;
  ruta: string;
}

export default function Suscripciones() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SubItem[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function cargar() {
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      const [slots, unidades, trackers, empresa] = await Promise.all([
        supabase
          .from('ev_slots')
          .select('id, vence_en', { count: 'exact' })
          .eq('owner_id', user!.id)
          .eq('estado', 'active'),
        proveedor
          ? supabase
              .from('unidades_empresa')
              .select('id, is_active, conteo_subscription_status')
              .eq('proveedor_id', proveedor.id)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from('gps_trackers').select('id, is_active'),
        supabase
          .from('empresas_transporte')
          .select('id')
          .eq('user_id', user!.id)
          .eq('is_active', true),
      ]);

      const slotsActivos = (slots.data || []).filter(
        (s: any) => !s.vence_en || s.vence_en > nowIso,
      ).length;

      const unidadesArr = (unidades as any).data || [];
      const unidadesActivas = unidadesArr.filter((u: any) => u.is_active).length;
      const conteoActivo = unidadesArr.filter(
        (u: any) => u.conteo_subscription_status === 'active',
      ).length;

      const trackersArr = (trackers as any).data || [];
      const trackersActivos = trackersArr.filter((t: any) => t.is_active).length;

      const empresasActivas = ((empresa as any).data || []).length;

      setItems([
        {
          key: 'eventos',
          titulo: 'Eventos y boletaje',
          descripcion: 'Salones, eventos y pases QR verificables',
          precio: '$500 por slot de salón · $1 por QR',
          icon: Calendar,
          activa: slotsActivos > 0,
          detalle:
            slotsActivos > 0
              ? `${slotsActivos} slot${slotsActivos === 1 ? '' : 's'} pagado${slotsActivos === 1 ? '' : 's'}`
              : 'Sin slots pagados',
          ruta: '/eventos',
        },
        {
          key: 'unidades',
          titulo: 'Concesionario · Unidades',
          descripcion: 'Rutas, choferes y unidades en el mapa',
          precio: '$400 al mes por unidad',
          icon: Bus,
          activa: unidadesActivas > 0,
          detalle:
            unidadesActivas > 0
              ? `${unidadesActivas} unidad${unidadesActivas === 1 ? '' : 'es'} activa${unidadesActivas === 1 ? '' : 's'}`
              : 'Sin unidades activas',
          ruta: '/mis-rutas',
        },
        {
          key: 'conteo',
          titulo: 'Conteo de pasajeros',
          descripcion: 'Sensor ESP32 y conteo automático a bordo',
          precio: 'Suscripción por unidad',
          icon: Users,
          activa: conteoActivo > 0,
          detalle:
            conteoActivo > 0
              ? `${conteoActivo} unidad${conteoActivo === 1 ? '' : 'es'} con conteo`
              : 'Sin unidades con conteo',
          ruta: '/mis-rutas',
        },
        {
          key: 'gps',
          titulo: 'Tracking GPS',
          descripcion: 'Rastreadores GPS y geocercas',
          precio: 'Suscripción por rastreador',
          icon: Satellite,
          activa: trackersActivos > 0,
          detalle:
            trackersActivos > 0
              ? `${trackersActivos} rastreador${trackersActivos === 1 ? '' : 'es'} activo${trackersActivos === 1 ? '' : 's'}`
              : 'Sin rastreadores activos',
          ruta: '/tracking-gps',
        },
        {
          key: 'empresa',
          titulo: 'Transporte de personal',
          descripcion: 'Contratos, empleados y validaciones',
          precio: 'Plan empresa',
          icon: Building2,
          activa: empresasActivas > 0,
          detalle: empresasActivas > 0 ? 'Empresa registrada y activa' : 'Sin empresa registrada',
          ruta: '/panel-maquiladora',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const activas = items.filter((i) => i.activa).length;

  return (
    <div className="min-h-screen bg-background pb-40">
      <header className="bg-primary/5 border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">Mis suscripciones</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Consultando…' : `${activas} de ${items.length} activas`}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          items.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.key}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  item.activa ? 'border-primary' : 'border-border'
                }`}
                onClick={() => navigate(item.ruta)}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.activa ? 'bg-primary/10' : 'bg-muted'
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${item.activa ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base truncate">{item.titulo}</h3>
                      <Badge
                        variant={item.activa ? 'default' : 'secondary'}
                        className="flex items-center gap-1 flex-shrink-0"
                      >
                        {item.activa ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {item.activa ? 'Activada' : 'Desactivada'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.descripcion}</p>
                    <p className="text-sm font-medium mt-2">{item.detalle}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.precio}</p>
                    <div className="mt-3">
                      <Button variant={item.activa ? 'outline' : 'default'} size="sm">
                        {item.activa ? 'Administrar' : 'Activar'}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}
