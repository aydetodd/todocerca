import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Vote, Lock, Globe, Users, School, MapPin, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { NavigationBar } from '@/components/NavigationBar';

// Tipos de nivel de votación
const NIVELES_VOTACION = [
  { id: 'nacional', label: 'Nacional', icon: Globe },
  { id: 'estatal', label: 'Estatal', icon: Building },
  { id: 'ciudad', label: 'Ciudad', icon: MapPin },
  { id: 'barrio', label: 'Barrio', icon: Users },
  { id: 'escuela', label: 'Escuela/Salón', icon: School },
];

export default function Votaciones() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('abiertas');

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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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

          <TabsContent value="abiertas" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Votaciones públicas donde cualquier persona de la comunidad puede participar.
            </p>
            
            {/* Filtros por nivel */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {NIVELES_VOTACION.map((nivel) => (
                <Badge 
                  key={nivel.id} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-primary/10 whitespace-nowrap"
                >
                  <nivel.icon className="h-3 w-3 mr-1" />
                  {nivel.label}
                </Badge>
              ))}
            </div>

            {/* Lista de votaciones abiertas - Placeholder */}
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No hay votaciones abiertas</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Sé el primero en crear una votación para tu comunidad
                </p>
                <Button onClick={() => navigate('/votaciones/crear')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Votación
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cerradas" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Votaciones privadas donde necesitas solicitar acceso para participar.
            </p>
            
            {/* Lista de votaciones cerradas - Placeholder */}
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No hay votaciones cerradas</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Las votaciones cerradas requieren invitación o solicitud de acceso
                </p>
                <Button variant="outline" onClick={() => navigate('/votaciones/crear')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Votación Privada
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info sobre tipos de votación */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Niveles de Votación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {NIVELES_VOTACION.map((nivel) => (
              <div key={nivel.id} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <nivel.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-muted-foreground">{nivel.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>

      <NavigationBar />
    </div>
  );
}
