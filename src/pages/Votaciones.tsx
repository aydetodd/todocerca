import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Vote, Lock, Globe, Users, School, MapPin, Building, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { NavigationBar } from '@/components/NavigationBar';
import { useAuth } from '@/hooks/useAuth';
import { useVotaciones } from '@/hooks/useVotaciones';

// Tipos de nivel de votación
const NIVELES_VOTACION = [
  { id: 'todas', label: 'Todas', icon: Globe },
  { id: 'familiar', label: 'Familiar', icon: Home },
  { id: 'nacional', label: 'Nacional', icon: Globe },
  { id: 'estatal', label: 'Estatal', icon: Building },
  { id: 'ciudad', label: 'Ciudad', icon: MapPin },
  { id: 'barrio', label: 'Barrio', icon: Users },
  { id: 'escuela', label: 'Escuela/Salón', icon: School },
] as const;

type NivelId = (typeof NIVELES_VOTACION)[number]['id'];

export default function Votaciones() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'abiertas' | 'cerradas'>('abiertas');
  const [nivelFiltro, setNivelFiltro] = useState<NivelId>('todas');

  const nivelDb = nivelFiltro === 'todas' ? null : nivelFiltro;

  const abiertasQuery = useVotaciones({ tipo: 'abierta', nivel: nivelDb, onlyActive: true });
  const cerradasQuery = useVotaciones({ tipo: 'cerrada', nivel: nivelDb, onlyActive: true });

  const niveles = useMemo(() => NIVELES_VOTACION, []);

  const renderEmpty = (
    icon: React.ReactNode,
    title: string,
    description: string,
  ) => (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <h3 className="font-medium mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  const renderList = (
    query: typeof abiertasQuery,
    emptyIcon: React.ReactNode,
    emptyTitle: string,
    emptyDescription: string,
  ) => {
    if (query.isLoading) {
      return (
        <div className="space-y-3">
          <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
          <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
          <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
        </div>
      );
    }

    if (query.error) {
      return renderEmpty(
        <Vote className="h-10 w-10" />,
        'No se pudieron cargar las votaciones',
        'Intenta de nuevo más tarde.',
      );
    }

    const items = query.data ?? [];

    if (items.length === 0) {
      return renderEmpty(emptyIcon, emptyTitle, emptyDescription);
    }

    return (
      <div className="space-y-3">
        {items.map((v) => (
          <Card key={v.id} className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{v.titulo}</CardTitle>
                  {v.descripcion ? (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{v.descripcion}</p>
                  ) : null}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {niveles.find((n) => n.id === (v.nivel as NivelId))?.label ?? v.nivel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">Cierra: {new Date(v.fecha_fin).toLocaleString()}</span>
              <Badge variant="outline" className="shrink-0">
                {v.tipo === 'abierta' ? 'Abierta' : 'Cerrada'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Votaciones</h1>
            <p className="text-xs text-muted-foreground">Participa en votaciones comunitarias</p>
          </div>
          <Button size="sm" onClick={() => navigate('/votaciones/crear')}>
            <Plus className="h-4 w-4 mr-1" />
            Crear
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 space-y-4">
        {/* Tabs para tipo de votación */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'abiertas' | 'cerradas')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="abiertas" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Abiertas
            </TabsTrigger>
            <TabsTrigger value="cerradas" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Cerradas
            </TabsTrigger>
          </TabsList>

          {/* Filtros por nivel */}
          <div className="flex gap-2 overflow-x-auto pb-2 mt-4">
            {niveles.map((nivel) => (
              <Badge
                key={nivel.id}
                role="button"
                tabIndex={0}
                aria-pressed={nivelFiltro === nivel.id}
                variant={nivelFiltro === nivel.id ? 'default' : 'outline'}
                onClick={() => setNivelFiltro(nivel.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setNivelFiltro(nivel.id);
                }}
                className="cursor-pointer select-none whitespace-nowrap"
              >
                <nivel.icon className="h-3 w-3 mr-1" />
                {nivel.label}
              </Badge>
            ))}
          </div>

          <TabsContent value="abiertas" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Votaciones públicas donde cualquier persona de la comunidad puede participar.
            </p>

            {renderList(
              abiertasQuery,
              <Vote className="h-10 w-10" />,
              'No hay votaciones abiertas',
              'Usa “Crear” arriba para iniciar una votación.',
            )}
          </TabsContent>

          <TabsContent value="cerradas" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Votaciones privadas donde necesitas invitación o acceso para participar.
            </p>

            {!user ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center">
                  <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Inicia sesión para ver tus votaciones cerradas</h3>
                  <p className="text-sm text-muted-foreground">
                    Las votaciones cerradas solo se muestran a miembros autorizados.
                  </p>
                  <div className="mt-4">
                    <Button variant="outline" onClick={() => navigate('/auth')}>Ir a iniciar sesión</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              renderList(
                cerradasQuery,
                <Lock className="h-10 w-10" />,
                'No tienes votaciones cerradas',
                'Cuando te inviten (o crees una), aparecerá aquí.',
              )
            )}
          </TabsContent>
        </Tabs>
      </main>

      <NavigationBar />
    </div>
  );
}
