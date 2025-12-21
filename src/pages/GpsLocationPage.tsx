import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGeography, GeografiaCompleta } from '@/hooks/useGeography';
import { GeographySelector } from '@/components/GeographySelector';
import { NavigationBar } from '@/components/NavigationBar';

interface GpsLocationPageProps {
  basePath?: string;
  title?: string;
}

export default function GpsLocationPage({ 
  basePath = '/gps',
  title = 'Tracking GPS'
}: GpsLocationPageProps) {
  const { paisCode, nivel1Slug, nivel2Slug } = useParams<{
    paisCode?: string;
    nivel1Slug?: string;
    nivel2Slug?: string;
  }>();
  
  const navigate = useNavigate();
  const { findBySlugs, generateSlugUrl, loading } = useGeography();
  const [geografia, setGeografia] = useState<GeografiaCompleta>({
    pais: null,
    nivel1: null,
    nivel2: null
  });
  const [isLoading, setIsLoading] = useState(true);

  // Cargar ubicación desde URL
  useEffect(() => {
    const loadFromUrl = async () => {
      if (paisCode && nivel1Slug) {
        setIsLoading(true);
        const result = await findBySlugs(paisCode, nivel1Slug, nivel2Slug);
        setGeografia(result);
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    };
    loadFromUrl();
  }, [paisCode, nivel1Slug, nivel2Slug, findBySlugs]);

  // Manejar cambio en selector
  const handleSelectionChange = (selection: GeografiaCompleta) => {
    if (selection.nivel2) {
      const url = generateSlugUrl(basePath, selection.pais, selection.nivel1, selection.nivel2);
      navigate(url);
    } else if (selection.nivel1) {
      const url = generateSlugUrl(basePath, selection.pais, selection.nivel1, null);
      navigate(url);
    }
  };

  // Construir breadcrumb
  const getBreadcrumb = () => {
    const parts = [];
    if (geografia.pais) {
      parts.push(geografia.pais.nombre);
    }
    if (geografia.nivel1) {
      parts.push(geografia.nivel1.nombre);
    }
    if (geografia.nivel2) {
      parts.push(geografia.nivel2.nombre);
    }
    return parts.join(' › ');
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      
      <main className="container mx-auto px-4 py-6 pb-24">
        {/* Header con breadcrumb */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {getBreadcrumb() && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {getBreadcrumb()}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Selector de ubicación */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Seleccionar Ubicación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GeographySelector
                  onSelectionChange={handleSelectionChange}
                  initialPaisId={geografia.pais?.id}
                  initialNivel1Id={geografia.nivel1?.id}
                  initialNivel2Id={geografia.nivel2?.id}
                />
              </CardContent>
            </Card>

            {/* Contenido principal */}
            <div className="md:col-span-2">
              {geografia.nivel2 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {title} en {geografia.nivel2.nombre}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <h3 className="font-medium mb-2">Ubicación seleccionada:</h3>
                        <p className="text-sm text-muted-foreground">
                          {geografia.nivel2.nombre}, {geografia.nivel1?.nombre}, {geografia.pais?.nombre}
                        </p>
                        {geografia.nivel2.latitud && geografia.nivel2.longitud && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Coordenadas: {geografia.nivel2.latitud}, {geografia.nivel2.longitud}
                          </p>
                        )}
                      </div>
                      
                      {/* Aquí irá el contenido de tracking/rutas */}
                      <div className="text-center py-8 text-muted-foreground">
                        <p>Los dispositivos GPS y rutas de esta ubicación aparecerán aquí.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : geografia.nivel1 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {title} en {geografia.nivel1.nombre}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Selecciona un {geografia.pais?.codigo_iso === 'MX' ? 'municipio' : 'municipio/distrito'} para ver los dispositivos disponibles.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Selecciona una ubicación</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Usa el selector para elegir el país, estado y municipio donde quieres ver el tracking GPS.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
