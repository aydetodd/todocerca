import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Car, Tv, Vote, Sparkles } from 'lucide-react';

const FASES = [
  {
    icon: Car,
    titulo: 'Taxi seguro',
    fase: 'Fase 2',
    desc: 'Pedir taxi desde la app igual que las rutas públicas: ves el carro en el mapa, el nombre del chofer y pagas con tu tarjeta QaRd. Todo el viaje queda registrado.',
  },
  {
    icon: Tv,
    titulo: 'TodoCerca TV',
    fase: 'Fase 3',
    desc: 'Canal de video con contenido local: avisos, eventos y promociones de tu ciudad, directo en la app.',
  },
  {
    icon: Vote,
    titulo: 'Votaciones',
    fase: 'Fase 3',
    desc: 'Encuestas y votaciones ciudadanas y privadas con resultados en tiempo real, verificadas con tu cuenta.',
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
