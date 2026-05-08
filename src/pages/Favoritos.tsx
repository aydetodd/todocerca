import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavoritos, Favorito } from '@/hooks/useFavoritos';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Trash2, MapPin, Bus, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Favoritos() {
  const navigate = useNavigate();
  const { favoritos, loading, userId, removeFavorito } = useFavoritos();
  const [accessibleRouteIds, setAccessibleRouteIds] = useState<Set<string>>(new Set());

  // Solo rutas (tipo='ruta') con producto cargado y que NO sean taxi
  const rutas = useMemo(
    () =>
      favoritos.filter(
        (f) =>
          f.tipo === 'ruta' &&
          f.producto &&
          f.producto.route_type !== 'taxi'
      ),
    [favoritos]
  );

  // Verificar acceso vigente para rutas privadas (pasajero vinculado o dueño concesionario)
  useEffect(() => {
    const privadas = rutas.filter((r) => r.producto?.is_private || r.producto?.route_type === 'privada');
    if (privadas.length === 0 || !userId) {
      setAccessibleRouteIds(new Set(rutas.map((r) => r.producto!.id)));
      return;
    }

    const ids = privadas.map((r) => r.producto!.id);
    const proveedorIds = Array.from(
      new Set(privadas.map((r) => r.producto!.proveedor_id).filter(Boolean))
    );

    Promise.all([
      supabase
        .from('route_passenger_access')
        .select('producto_id')
        .eq('user_id', userId)
        .in('producto_id', ids),
      supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', userId)
        .in('id', proveedorIds),
    ]).then(([accessRes, ownerRes]) => {
      const accessible = new Set<string>(
        rutas
          .filter((r) => !r.producto!.is_private && r.producto!.route_type !== 'privada')
          .map((r) => r.producto!.id)
      );
      (accessRes.data || []).forEach((row: any) => accessible.add(row.producto_id));
      const ownedProvIds = new Set((ownerRes.data || []).map((r: any) => r.id));
      privadas.forEach((r) => {
        if (ownedProvIds.has(r.producto!.proveedor_id)) {
          accessible.add(r.producto!.id);
        }
      });
      setAccessibleRouteIds(accessible);
    });
  }, [rutas, userId]);

  const visibles = rutas.filter((r) => accessibleRouteIds.has(r.producto!.id));
  const privadas = visibles.filter((r) => r.producto!.is_private || r.producto!.route_type === 'privada');
  const publicas = visibles.filter((r) => !r.producto!.is_private && r.producto!.route_type !== 'privada');

  if (!userId) {
    return (
      <div className="min-h-screen bg-background pb-40">
        <GlobalHeader />
        <div className="container mx-auto px-4 py-8">
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold mb-2">Inicia sesión</h2>
              <p className="text-muted-foreground">Para ver tus rutas favoritas</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-40">
        <GlobalHeader />
        <div className="container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-40">
      <GlobalHeader />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Heart className="h-6 w-6 text-primary fill-primary" />
          Mis Rutas Favoritas
        </h1>

        {visibles.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center space-y-3">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground/40" />
              <h2 className="text-xl font-semibold">Aún no tienes rutas favoritas</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Cuando abras el enlace de una ruta privada, se guardará aquí automáticamente para que la veas con un solo toque.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {privadas.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="h-4 w-4 text-orange-500" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Rutas privadas
                  </h2>
                  <Badge variant="secondary" className="ml-auto">{privadas.length}</Badge>
                </div>
                <div className="space-y-2">
                  {privadas.map((fav) => (
                    <RutaCard
                      key={fav.id}
                      favorito={fav}
                      privada
                      onOpen={() => {
                        const token = fav.producto!.invite_token;
                        if (token) navigate(`/mapa?type=ruta&token=${token}`);
                        else navigate(`/mapa?type=ruta&producto=${fav.producto!.id}`);
                      }}
                      onRemove={() => removeFavorito(fav.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {publicas.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Bus className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Rutas públicas
                  </h2>
                  <Badge variant="secondary" className="ml-auto">{publicas.length}</Badge>
                </div>
                <div className="space-y-2">
                  {publicas.map((fav) => (
                    <RutaCard
                      key={fav.id}
                      favorito={fav}
                      privada={false}
                      onOpen={() =>
                        navigate(`/search?category=rutas&overrideRoute=${fav.producto!.id}`)
                      }
                      onRemove={() => removeFavorito(fav.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RutaCard({
  favorito,
  privada,
  onOpen,
  onRemove,
}: {
  favorito: Favorito;
  privada: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const p = favorito.producto!;
  const tipoLabel = privada
    ? 'Privada'
    : p.route_type === 'foranea'
    ? 'Foránea'
    : 'Urbana';
  const ubicacion = [p.ciudad, p.estado].filter(Boolean).join(', ');

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.99]"
      onClick={onOpen}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            privada ? 'bg-orange-500/10 text-orange-500' : 'bg-primary/10 text-primary'
          }`}
        >
          {privada ? <Lock className="h-5 w-5" /> : <Bus className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-semibold break-words flex-1 min-w-0">{p.nombre}</h3>
            <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
              {tipoLabel}
            </Badge>
          </div>
          {ubicacion && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{ubicacion}</span>
            </div>
          )}
          <div className="text-xs text-primary mt-1">Toca para ver el camión en vivo</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Quitar de favoritos"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardContent>
    </Card>
  );
}
