import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NavigationBar } from '@/components/NavigationBar';
import { useVotaciones } from '@/hooks/useVotaciones';

export default function Votaciones() {
  const navigate = useNavigate();
  const { data: votaciones, isLoading, error } = useVotaciones({ onlyActive: true });

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
        {isLoading ? (
          <div className="space-y-3">
            <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
            <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
            <Card><CardContent className="p-5 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
          </div>
        ) : error ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No se pudieron cargar las votaciones</h3>
              <p className="text-sm text-muted-foreground">Intenta de nuevo más tarde.</p>
            </CardContent>
          </Card>
        ) : !votaciones || votaciones.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No hay votaciones disponibles</h3>
              <p className="text-sm text-muted-foreground">
                Usa "Crear" para iniciar una nueva votación.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {votaciones.map((v) => (
              <Card key={v.id} className="hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{v.titulo}</CardTitle>
                      {v.descripcion && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{v.descripcion}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {v.nivel}
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
        )}
      </main>

      <NavigationBar />
    </div>
  );
}
