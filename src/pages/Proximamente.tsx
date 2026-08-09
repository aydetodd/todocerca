import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Car, Megaphone, Store, Home as HomeIcon, Sparkles } from 'lucide-react';

const FASES = [
  {
    icon: Car,
    titulo: 'Taxi seguro',
    fase: 'Fase 2',
    desc: 'Pedir taxi desde la app igual que las rutas públicas: ves el carro en el mapa, el nombre del chofer y pagas con tu tarjeta QaRd. Todo el viaje queda registrado.',
  },
  {
    icon: Megaphone,
    titulo: 'Reportes ciudadanos',
    fase: 'Fase 3',
    desc: 'Avisar de un bache, una luminaria apagada o basura acumulada con foto y ubicación. El reporte se envía a la autoridad y tú puedes seguir su avance.',
  },
  {
    icon: Store,
    titulo: 'Buscar bienes y servicios',
    fase: 'Fase 3',
    desc: 'Buscar tiendas, talleres, doctores o cualquier proveedor cerca de ti, ver su catálogo, precios y apartar o agendar desde la app.',
  },
  {
    icon: HomeIcon,
    titulo: 'Domótica (casa inteligente)',
    fase: 'Fase 4',
    desc: 'Prender y apagar luces, portones o cámaras de tu casa o negocio desde el teléfono, con avisos cuando algo se activa.',
  },
];

export default function Proximamente() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-40">
      <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Regresar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Próximamente</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Sparkles className="h-5 w-5 text-primary mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Hoy TodoCerca está enfocado en <strong className="text-foreground">transporte</strong> y en tu tarjeta{' '}
            <strong className="text-foreground">QaRd</strong>. Estos servicios se irán activando por fases:
          </p>
        </div>

        {FASES.map(({ icon: Icon, titulo, fase, desc }) => (
          <Card key={titulo}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 text-primary" />
                  {titulo}
                </CardTitle>
                <Badge variant="secondary">{fase}</Badge>
              </div>
              <CardDescription>Aún no disponible</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}

        <p className="text-xs text-muted-foreground text-center pt-2">
          Te avisaremos dentro de la app cuando cada servicio se active.
        </p>
      </main>
    </div>
  );
}
