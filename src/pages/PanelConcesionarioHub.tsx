import { useNavigate } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Bus, Truck, CarFront, Lock } from 'lucide-react';

type PanelOption = {
  key: 'publico' | 'foraneo' | 'privado';
  label: string;
  description: string;
  icon: typeof Bus;
  color: string;
  bgColor: string;
  to?: string;
  disabled?: boolean;
};

const OPTIONS: PanelOption[] = [
  {
    key: 'publico',
    label: 'Concesionario Público',
    description: 'Ingresos QR, liquidaciones Stripe, choferes y unidades urbanas.',
    icon: Bus,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    to: '/panel-concesionario/publico',
  },
  {
    key: 'foraneo',
    label: 'Concesionario Foráneo',
    description: 'Próximamente. Aún no disponible para acceso.',
    icon: Truck,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    disabled: true,
  },
  {
    key: 'privado',
    label: 'Concesionario Privado',
    description: 'Por viaje, por pasajeros, reportes, choferes y unidades.',
    icon: CarFront,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    to: '/panel-concesionario/privado',
  },
];

export default function PanelConcesionarioHub() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main className="container mx-auto px-4 py-6 pb-40 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>
        <h1 className="text-2xl font-bold mb-1">Panel de Concesionario</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Elige el tipo de operación que deseas administrar.
        </p>

        <div className="grid gap-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Card
                key={opt.key}
                className={`transition-colors ${
                  opt.disabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer hover:border-primary/50'
                }`}
                onClick={() => {
                  if (opt.disabled || !opt.to) return;
                  navigate(opt.to);
                }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl ${opt.bgColor} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-7 w-7 ${opt.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{opt.label}</h3>
                      {opt.disabled && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Lock className="h-3 w-3" /> Próximamente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
