import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Globe, Lock, Building, MapPin, Users, School, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const NIVELES_ABIERTA = [
  { id: 'nacional', label: 'Nacional', icon: Globe, description: 'Todo el país' },
  { id: 'estatal', label: 'Estatal', icon: Building, description: 'Un estado/provincia' },
  { id: 'ciudad', label: 'Localidad', icon: MapPin, description: 'Un municipio/ciudad específico' },
];

const NIVELES_CERRADA = [
  { id: 'familiar', label: 'Familiar', icon: Home, description: 'Solo familia' },
  { id: 'barrio', label: 'Barrio', icon: Users, description: 'Vecinos del barrio' },
  { id: 'escuela', label: 'Escuela/Salón', icon: School, description: 'Grupo escolar' },
];

interface Pais {
  id: string;
  nombre: string;
  codigo_iso: string;
}

interface Estado {
  id: string;
  nombre: string;
}

interface Ciudad {
  id: string;
  nombre: string;
}

export default function CrearVotacion() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<'abierta' | 'cerrada'>('abierta');
  const [nivel, setNivel] = useState('nacional');
  
  // Reset nivel cuando cambia el tipo
  useEffect(() => {
    if (tipo === 'abierta') {
      setNivel('nacional');
    } else {
      setNivel('familiar');
    }
    setSelectedPais('');
    setSelectedEstado('');
    setSelectedCiudad('');
    setUbicacionExtra('');
  }, [tipo]);
  const [fechaFin, setFechaFin] = useState('');
  const [requiereVerificacion, setRequiereVerificacion] = useState(true);
  const [opciones, setOpciones] = useState<string[]>(['', '']);
  const [ubicacionExtra, setUbicacionExtra] = useState('');
  
  // Geografía para votaciones abiertas
  const [paises, setPaises] = useState<Pais[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [selectedPais, setSelectedPais] = useState<string>('');
  const [selectedEstado, setSelectedEstado] = useState<string>('');
  const [selectedCiudad, setSelectedCiudad] = useState<string>('');

  // Cargar países al inicio
  useEffect(() => {
    loadPaises();
  }, []);

  // Cargar estados cuando se selecciona país
  useEffect(() => {
    if (selectedPais) {
      loadEstados(selectedPais);
    } else {
      setEstados([]);
      setSelectedEstado('');
    }
  }, [selectedPais]);

  // Cargar ciudades cuando se selecciona estado
  useEffect(() => {
    if (selectedEstado) {
      loadCiudades(selectedEstado);
    } else {
      setCiudades([]);
      setSelectedCiudad('');
    }
  }, [selectedEstado]);

  const loadPaises = async () => {
    const { data } = await supabase
      .from('paises')
      .select('id, nombre, codigo_iso')
      .eq('is_active', true)
      .order('nombre');
    if (data) setPaises(data);
  };

  const loadEstados = async (paisId: string) => {
    const { data } = await supabase
      .from('subdivisiones_nivel1')
      .select('id, nombre')
      .eq('pais_id', paisId)
      .eq('is_active', true)
      .order('nombre');
    if (data) setEstados(data);
  };

  const loadCiudades = async (estadoId: string) => {
    const { data } = await supabase
      .from('subdivisiones_nivel2')
      .select('id, nombre')
      .eq('nivel1_id', estadoId)
      .eq('is_active', true)
      .order('nombre');
    if (data) setCiudades(data);
  };

  const addOpcion = () => {
    if (opciones.length < 10) {
      setOpciones([...opciones, '']);
    }
  };

  const removeOpcion = (index: number) => {
    if (opciones.length > 2) {
      setOpciones(opciones.filter((_, i) => i !== index));
    }
  };

  const updateOpcion = (index: number, value: string) => {
    const newOpciones = [...opciones];
    newOpciones[index] = value;
    setOpciones(newOpciones);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "Debes iniciar sesión para crear una votación",
        variant: "destructive"
      });
      navigate('/auth');
      return;
    }

    if (!titulo.trim()) {
      toast({
        title: "Error",
        description: "El título es requerido",
        variant: "destructive"
      });
      return;
    }

    if (!fechaFin) {
      toast({
        title: "Error",
        description: "La fecha de cierre es requerida",
        variant: "destructive"
      });
      return;
    }

    const opcionesValidas = opciones.filter(o => o.trim());
    if (opcionesValidas.length < 2) {
      toast({
        title: "Error",
        description: "Se requieren al menos 2 opciones",
        variant: "destructive"
      });
      return;
    }

    // Validar geografía para votaciones abiertas
    if (tipo === 'abierta') {
      if (!selectedPais) {
        toast({
          title: "Error",
          description: "Debes seleccionar un país",
          variant: "destructive"
        });
        return;
      }
      if (nivel === 'estatal' && !selectedEstado) {
        toast({
          title: "Error",
          description: "Debes seleccionar un estado específico para votación estatal",
          variant: "destructive"
        });
        return;
      }
      if (nivel === 'ciudad' && (!selectedEstado || !selectedCiudad)) {
        toast({
          title: "Error",
          description: "Debes seleccionar un estado y una localidad específica",
          variant: "destructive"
        });
        return;
      }
    }

    setLoading(true);

    try {
      // Crear la votación con geografía
      const { data: votacion, error: votacionError } = await supabase
        .from('votaciones')
        .insert({
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          tipo,
          nivel,
          fecha_fin: new Date(fechaFin).toISOString(),
          requiere_verificacion_telefono: requiereVerificacion,
          creador_id: user.id,
          barrio: nivel === 'barrio' ? ubicacionExtra : null,
          escuela: nivel === 'escuela' ? ubicacionExtra : null,
          // Geografía para votaciones abiertas
          pais_id: tipo === 'abierta' && selectedPais ? selectedPais : null,
          estado_id: tipo === 'abierta' && selectedEstado ? selectedEstado : null,
          ciudad_id: tipo === 'abierta' && selectedCiudad ? selectedCiudad : null,
        })
        .select()
        .single();

      if (votacionError) throw votacionError;

      // Crear las opciones
      const opcionesData = opcionesValidas.map((nombre, index) => ({
        votacion_id: votacion.id,
        nombre: nombre.trim(),
        orden: index
      }));

      const { error: opcionesError } = await supabase
        .from('votacion_opciones')
        .insert(opcionesData);

      if (opcionesError) throw opcionesError;

      // Si es cerrada, agregar al creador como miembro
      if (tipo === 'cerrada') {
        await supabase
          .from('votacion_miembros')
          .insert({
            votacion_id: votacion.id,
            user_id: user.id,
            agregado_por: user.id
          });
      }

      toast({
        title: "¡Votación creada!",
        description: "Tu votación está lista para recibir votos"
      });

      navigate('/votaciones');
    } catch (error: any) {
      console.error('Error creating votacion:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la votación",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Crear Votación</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info básica */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  placeholder="Ej: Reina del salón 6°A"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  placeholder="Describe de qué trata la votación..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fechaFin">Fecha de cierre *</Label>
                <Input
                  id="fechaFin"
                  type="datetime-local"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Tipo de votación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tipo de Votación</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as 'abierta' | 'cerrada')}>
                <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="abierta" id="abierta" />
                  <Globe className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <Label htmlFor="abierta" className="cursor-pointer font-medium">Abierta</Label>
                    <p className="text-xs text-muted-foreground">Cualquier persona puede votar</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="cerrada" id="cerrada" />
                  <Lock className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <Label htmlFor="cerrada" className="cursor-pointer font-medium">Cerrada</Label>
                    <p className="text-xs text-muted-foreground">Solo miembros autorizados pueden votar</p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Nivel y Ubicación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {tipo === 'abierta' ? 'Alcance de la Votación' : 'Tipo de Grupo'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Niveles según tipo */}
              <RadioGroup 
                value={nivel} 
                onValueChange={(v) => {
                  setNivel(v);
                  // Reset selections when changing level
                  setSelectedEstado('');
                  setSelectedCiudad('');
                }}
              >
                {(tipo === 'abierta' ? NIVELES_ABIERTA : NIVELES_CERRADA).map((n) => (
                  <div 
                    key={n.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                  >
                    <RadioGroupItem value={n.id} id={n.id} />
                    <n.icon className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <Label htmlFor={n.id} className="cursor-pointer font-medium">{n.label}</Label>
                      <p className="text-xs text-muted-foreground">{n.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>

              {/* Ubicación extra para cerradas */}
              {tipo === 'cerrada' && (nivel === 'barrio' || nivel === 'escuela') && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                  <Label>{nivel === 'barrio' ? 'Nombre del barrio' : 'Nombre de la escuela/salón'}</Label>
                  <Input
                    placeholder={nivel === 'barrio' ? 'Ej: Colonia Centro' : 'Ej: Escuela Primaria #5, Salón 6°A'}
                    value={ubicacionExtra}
                    onChange={(e) => setUbicacionExtra(e.target.value)}
                  />
                </div>
              )}

              {/* Selector dinámico de geografía para votaciones abiertas */}
              {tipo === 'abierta' && (
                <div className="space-y-3 p-3 rounded-lg bg-muted/30">
                  <p className="text-sm font-medium">📍 Seleccionar ubicación</p>
                  
                  {/* País - siempre visible */}
                  <div className="space-y-1">
                    <Label className="text-xs">País</Label>
                    <Select value={selectedPais} onValueChange={(v) => {
                      setSelectedPais(v);
                      setSelectedEstado('');
                      setSelectedCiudad('');
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un país" />
                      </SelectTrigger>
                      <SelectContent>
                        {paises.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Estado - visible si hay país y nivel es estatal o ciudad */}
                  {selectedPais && (nivel === 'estatal' || nivel === 'ciudad') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Estado/Provincia *</Label>
                      <Select value={selectedEstado} onValueChange={(v) => {
                        setSelectedEstado(v);
                        setSelectedCiudad('');
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un estado" />
                        </SelectTrigger>
                        <SelectContent>
                          {estados.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Localidad - visible si hay estado seleccionado y nivel es ciudad */}
                  {selectedEstado && nivel === 'ciudad' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Localidad (Municipio/Ciudad) *</Label>
                      <Select value={selectedCiudad} onValueChange={setSelectedCiudad}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un municipio/ciudad" />
                        </SelectTrigger>
                        <SelectContent>
                          {ciudades.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Resumen de alcance */}
                  <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
                    {nivel === 'nacional' && selectedPais && (
                      <span>🗳️ Votarán usuarios con número de <strong>{paises.find(p => p.id === selectedPais)?.nombre || 'país seleccionado'}</strong></span>
                    )}
                    {nivel === 'estatal' && selectedPais && (
                      !selectedEstado ? (
                        <span className="text-amber-500">⚠️ Selecciona un estado específico</span>
                      ) : (
                        <span>🗳️ Votarán usuarios del estado <strong>{estados.find(e => e.id === selectedEstado)?.nombre}</strong></span>
                      )
                    )}
                    {nivel === 'ciudad' && selectedPais && (
                      !selectedEstado ? (
                        <span className="text-amber-500">⚠️ Selecciona un estado para ver las localidades</span>
                      ) : !selectedCiudad ? (
                        <span className="text-amber-500">⚠️ Selecciona una localidad específica</span>
                      ) : (
                        <span>🗳️ Votarán usuarios de <strong>{ciudades.find(c => c.id === selectedCiudad)?.nombre}, {estados.find(e => e.id === selectedEstado)?.nombre}</strong></span>
                      )
                    )}
                    {!selectedPais && <span>Selecciona un país para continuar</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Opciones de votación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opciones de Votación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opciones.map((opcion, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={`Opción ${index + 1}`}
                    value={opcion}
                    onChange={(e) => updateOpcion(index, e.target.value)}
                  />
                  {opciones.length > 2 && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeOpcion(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              
              {opciones.length < 10 && (
                <Button type="button" variant="outline" className="w-full" onClick={addOpcion}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar opción
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Configuración */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuración</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Verificación de teléfono</Label>
                  <p className="text-xs text-muted-foreground">Requiere teléfono verificado para votar</p>
                </div>
                <Switch
                  checked={requiereVerificacion}
                  onCheckedChange={setRequiereVerificacion}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Creando...' : 'Crear Votación'}
          </Button>
        </form>
      </main>
    </div>
  );
}
