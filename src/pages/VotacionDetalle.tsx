import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, UserPlus, Download, Users, Vote, Clock, CheckCircle, XCircle, AlertCircle, Share2, Link, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { NavigationBar } from '@/components/NavigationBar';

interface Votacion {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  nivel: string;
  fecha_inicio: string;
  fecha_fin: string;
  is_active: boolean;
  creador_id: string;
  requiere_verificacion_telefono: boolean;
  pais_id: string | null;
  estado_id: string | null;
  ciudad_id: string | null;
}

interface Opcion {
  id: string;
  nombre: string;
  orden: number;
  votos_count?: number;
}

interface Miembro {
  id: string;
  user_id: string;
  profile?: {
    nombre: string;
    telefono: string | null;
  };
}

interface Voto {
  id: string;
  user_id: string;
  opcion_id: string;
  fecha_voto: string;
  telefono: string | null;
  observacion: string | null;
  opcion?: {
    nombre: string;
  };
}

export default function VotacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [votacion, setVotacion] = useState<Votacion | null>(null);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [votos, setVotos] = useState<Voto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [votacionCerrada, setVotacionCerrada] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editFechaFin, setEditFechaFin] = useState('');
  const [saving, setSaving] = useState(false);

  // Invite state
  const [invitePhone, setInvitePhone] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  // Vote state
  const [selectedOpcion, setSelectedOpcion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [voting, setVoting] = useState(false);
  
  // Access control state
  const [canVote, setCanVote] = useState(true);
  const [accessMessage, setAccessMessage] = useState('');

  useEffect(() => {
    if (id) {
      loadVotacion();
    }
  }, [id, user]);

  const loadVotacion = async () => {
    try {
      // Cargar votación
      const { data: vot, error: votError } = await supabase
        .from('votaciones')
        .select('*')
        .eq('id', id)
        .single();

      if (votError) throw votError;
      setVotacion(vot);
      setIsCreator(vot.creador_id === user?.id);
      setVotacionCerrada(new Date(vot.fecha_fin) < new Date());
      
      // Generar link de invitación para votaciones cerradas
      if (vot.tipo === 'cerrada') {
        const baseUrl = window.location.origin;
        setInviteLink(`${baseUrl}/votaciones/${vot.id}?invite=1`);
      }

      // Cargar opciones con conteo de votos
      const { data: opts, error: optsError } = await supabase
        .from('votacion_opciones')
        .select('*')
        .eq('votacion_id', id)
        .order('orden');

      if (optsError) throw optsError;

      // Contar votos por opción
      const { data: votosData } = await supabase
        .from('votos')
        .select('opcion_id')
        .eq('votacion_id', id);

      const votosCounts: Record<string, number> = {};
      votosData?.forEach(v => {
        votosCounts[v.opcion_id] = (votosCounts[v.opcion_id] || 0) + 1;
      });

      const opcionesConVotos = opts.map(o => ({
        ...o,
        votos_count: votosCounts[o.id] || 0
      }));
      setOpciones(opcionesConVotos);

      // Cargar miembros si es cerrada
      if (vot.tipo === 'cerrada') {
        const { data: miembrosData } = await supabase
          .from('votacion_miembros')
          .select('id, user_id')
          .eq('votacion_id', id);

        // Get profiles for members
        if (miembrosData && miembrosData.length > 0) {
          const userIds = miembrosData.map(m => m.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, nombre, telefono')
            .in('user_id', userIds);

          const miembrosConPerfil = miembrosData.map(m => ({
            ...m,
            profile: profiles?.find(p => p.user_id === m.user_id)
          }));
          setMiembros(miembrosConPerfil);
        }
      }

      // Verificar acceso para votaciones abiertas por geografía (prefijo telefónico)
      if (vot.tipo === 'abierta' && user) {
        const canAccess = await checkPhoneAccess(vot, user.id);
        setCanVote(canAccess.allowed);
        setAccessMessage(canAccess.message);
      }

      // Cargar voto del usuario actual
      if (user) {
        const { data: miVoto } = await supabase
          .from('votos')
          .select('opcion_id')
          .eq('votacion_id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (miVoto) {
          setUserVote(miVoto.opcion_id);
        }
      }

      // Si es creador y votación cerrada, cargar todos los votos para reporte
      if (vot.creador_id === user?.id) {
        const { data: allVotos } = await supabase
          .from('votos')
          .select('id, user_id, opcion_id, fecha_voto, telefono, observacion')
          .eq('votacion_id', id);

        // Add option names
        const votosConOpciones = allVotos?.map(v => ({
          ...v,
          opcion: opts.find(o => o.id === v.opcion_id)
        })) || [];
        setVotos(votosConOpciones);
      }

      setEditTitulo(vot.titulo);
      setEditDescripcion(vot.descripcion || '');
      setEditFechaFin(new Date(vot.fecha_fin).toISOString().slice(0, 16));

    } catch (error: any) {
      console.error('Error loading votacion:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar la votación",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Verificar acceso por prefijo telefónico para votaciones abiertas
  const checkPhoneAccess = async (vot: Votacion, userId: string): Promise<{ allowed: boolean; message: string }> => {
    // Si es nacional o familiar, todos pueden votar
    if (vot.nivel === 'nacional' || vot.nivel === 'familiar') {
      return { allowed: true, message: '' };
    }

    // Obtener teléfono del usuario
    const { data: profile } = await supabase
      .from('profiles')
      .select('telefono, phone')
      .eq('user_id', userId)
      .single();

    const userPhone = profile?.telefono || profile?.phone || '';
    
    if (!userPhone) {
      return { allowed: false, message: 'Necesitas verificar tu número de teléfono para votar' };
    }

    // Normalizar teléfono (quitar espacios, guiones, etc.)
    const cleanPhone = userPhone.replace(/[\s\-\(\)]/g, '');
    
    // Para México (+52), obtener prefijo de ciudad según nivel
    if (vot.nivel === 'ciudad' && vot.ciudad_id) {
      // Obtener info de la ciudad
      const { data: ciudad } = await supabase
        .from('subdivisiones_nivel2')
        .select('nombre, codigo_postal')
        .eq('id', vot.ciudad_id)
        .single();
      
      if (ciudad) {
        // Mapeo de ciudades mexicanas a prefijos telefónicos (ladas)
        const prefijos = getCityPhonePrefixes(ciudad.nombre);
        if (prefijos.length > 0) {
          const hasValidPrefix = prefijos.some(prefix => cleanPhone.includes(prefix));
          if (!hasValidPrefix) {
            return { 
              allowed: false, 
              message: `Esta votación es solo para residentes de ${ciudad.nombre}. Tu número no coincide con el área.`
            };
          }
        }
      }
    }

    if (vot.nivel === 'estatal' && vot.estado_id) {
      const { data: estado } = await supabase
        .from('subdivisiones_nivel1')
        .select('nombre')
        .eq('id', vot.estado_id)
        .single();
      
      if (estado) {
        const prefijos = getStatePhonePrefixes(estado.nombre);
        if (prefijos.length > 0) {
          const hasValidPrefix = prefijos.some(prefix => cleanPhone.includes(prefix));
          if (!hasValidPrefix) {
            return { 
              allowed: false, 
              message: `Esta votación es solo para residentes de ${estado.nombre}. Tu número no coincide con el área.`
            };
          }
        }
      }
    }

    return { allowed: true, message: '' };
  };

  // Mapeo de ciudades mexicanas a prefijos telefónicos (ladas)
  const getCityPhonePrefixes = (cityName: string): string[] => {
    const normalizedName = cityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const cityPrefixes: Record<string, string[]> = {
      'hermosillo': ['+52662', '52662', '662'],
      'cajeme': ['+52644', '52644', '644'],
      'ciudad obregon': ['+52644', '52644', '644'],
      'guaymas': ['+52622', '52622', '622'],
      'nogales': ['+52631', '52631', '631'],
      'navojoa': ['+52642', '52642', '642'],
      'san luis rio colorado': ['+52653', '52653', '653'],
      // Agregar más ciudades según sea necesario
      'guadalajara': ['+5233', '5233', '33'],
      'monterrey': ['+5281', '5281', '81'],
      'tijuana': ['+52664', '52664', '664'],
      'ciudad de mexico': ['+5255', '5255', '55'],
      'mexico': ['+5255', '5255', '55'],
      'puebla': ['+52222', '52222', '222'],
      'leon': ['+52477', '52477', '477'],
      'zapopan': ['+5233', '5233', '33'],
    };

    return cityPrefixes[normalizedName] || [];
  };

  // Mapeo de estados mexicanos a prefijos telefónicos
  const getStatePhonePrefixes = (stateName: string): string[] => {
    const normalizedName = stateName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const statePrefixes: Record<string, string[]> = {
      'sonora': ['+52662', '+52644', '+52622', '+52631', '+52642', '+52653', '662', '644', '622', '631', '642', '653'],
      'jalisco': ['+5233', '+52341', '+52378', '33', '341', '378'],
      'nuevo leon': ['+5281', '+5282', '81', '82'],
      'baja california': ['+52664', '+52665', '+52686', '664', '665', '686'],
      'ciudad de mexico': ['+5255', '55'],
      'estado de mexico': ['+5255', '+52722', '55', '722'],
      // Agregar más estados según sea necesario
    };

    return statePrefixes[normalizedName] || [];
  };

  // Compartir link por WhatsApp
  const shareViaWhatsApp = () => {
    const message = encodeURIComponent(
      `🗳️ Te invito a votar en: "${votacion?.titulo}"\n\n` +
      `📅 Cierra: ${votacion ? new Date(votacion.fecha_fin).toLocaleString() : ''}\n\n` +
      `🔗 Vota aquí: ${inviteLink}`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  // Copiar link al portapapeles
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: "Link copiado al portapapeles" });
    } catch (err) {
      toast({ title: "Error al copiar", variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    if (!votacion) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('votaciones')
        .update({
          titulo: editTitulo.trim(),
          descripcion: editDescripcion.trim() || null,
          fecha_fin: new Date(editFechaFin).toISOString()
        })
        .eq('id', votacion.id);

      if (error) throw error;

      toast({ title: "Votación actualizada" });
      setEditMode(false);
      loadVotacion();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!votacion) return;

    try {
      // Eliminar en orden: votos, opciones, miembros, votación
      await supabase.from('votos').delete().eq('votacion_id', votacion.id);
      await supabase.from('votacion_opciones').delete().eq('votacion_id', votacion.id);
      await supabase.from('votacion_miembros').delete().eq('votacion_id', votacion.id);
      await supabase.from('votacion_solicitudes').delete().eq('votacion_id', votacion.id);

      const { error } = await supabase
        .from('votaciones')
        .delete()
        .eq('id', votacion.id);

      if (error) throw error;

      toast({ title: "Votación eliminada" });
      navigate('/votaciones');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleInvite = async () => {
    if (!votacion || !invitePhone.trim()) return;
    setInviting(true);

    try {
      // Buscar usuario por teléfono
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nombre')
        .or(`telefono.eq.${invitePhone.trim()},phone.eq.${invitePhone.trim()}`);

      if (!profiles || profiles.length === 0) {
        toast({
          title: "Usuario no encontrado",
          description: "No existe un usuario con ese número de teléfono",
          variant: "destructive"
        });
        return;
      }

      const profile = profiles[0];

      // Verificar si ya es miembro
      const { data: existing } = await supabase
        .from('votacion_miembros')
        .select('id')
        .eq('votacion_id', votacion.id)
        .eq('user_id', profile.user_id)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Ya es miembro",
          description: "Este usuario ya está en la votación",
          variant: "destructive"
        });
        return;
      }

      // Agregar como miembro
      const { error } = await supabase
        .from('votacion_miembros')
        .insert({
          votacion_id: votacion.id,
          user_id: profile.user_id,
          agregado_por: user?.id
        });

      if (error) throw error;

      toast({ title: `${profile.nombre} agregado a la votación` });
      setInvitePhone('');
      loadVotacion();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setInviting(false);
    }
  };

  const handleVote = async () => {
    if (!votacion || !selectedOpcion || !user) return;
    setVoting(true);

    try {
      // Obtener últimos 3 dígitos del teléfono
      const { data: profile } = await supabase
        .from('profiles')
        .select('telefono, phone')
        .eq('user_id', user.id)
        .single();

      const telefono = profile?.telefono || profile?.phone || '';
      const ultimos3 = telefono.slice(-3);

      const { error } = await supabase
        .from('votos')
        .insert({
          votacion_id: votacion.id,
          user_id: user.id,
          opcion_id: selectedOpcion,
          telefono: ultimos3,
          observacion: observacion.trim() || null
        });

      if (error) throw error;

      toast({ title: "¡Voto registrado!" });
      setUserVote(selectedOpcion);
      loadVotacion();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setVoting(false);
    }
  };

  const exportCSV = () => {
    if (!votos.length || !opciones.length) return;

    const headers = ['Ultimos3Digitos', 'FechaHora', 'Observacion', 'Voto'];
    const rows = votos.map(v => [
      v.telefono || '---',
      new Date(v.fecha_voto).toLocaleString(),
      v.observacion || '',
      v.opcion?.nombre || ''
    ]);

    // Add summary
    rows.push([]);
    rows.push(['=== RESUMEN ===']);
    opciones.forEach(o => {
      rows.push([o.nombre, `${o.votos_count} votos`]);
    });
    rows.push([]);
    rows.push(['Total votos:', votos.length.toString()]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `votacion_${votacion?.titulo.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const totalVotos = opciones.reduce((sum, o) => sum + (o.votos_count || 0), 0);
  const ganador = opciones.reduce((prev, curr) => 
    (curr.votos_count || 0) > (prev.votos_count || 0) ? curr : prev, opciones[0]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!votacion) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/votaciones')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Votación no encontrada</h1>
          </div>
        </header>
        <NavigationBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/votaciones')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{votacion.titulo}</h1>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="capitalize text-xs">{votacion.nivel}</Badge>
              <Badge variant={votacion.tipo === 'abierta' ? 'default' : 'outline'} className="text-xs">
                {votacion.tipo === 'abierta' ? 'Abierta' : 'Cerrada'}
              </Badge>
              {votacionCerrada && (
                <Badge variant="destructive" className="text-xs">Finalizada</Badge>
              )}
            </div>
          </div>
          {isCreator && (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setEditMode(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar votación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán todos los votos y datos asociados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 space-y-4">
        {/* Info */}
        {votacion.descripcion && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{votacion.descripcion}</p>
            </CardContent>
          </Card>
        )}

        {/* Fechas */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div className="text-sm">
              <p>Cierra: <span className="font-medium">{new Date(votacion.fecha_fin).toLocaleString()}</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Resultados (si ya votó o es creador o cerrada) */}
        {(userVote || isCreator || votacionCerrada) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Vote className="h-5 w-5" />
                {votacionCerrada ? 'Resultados Finales' : 'Resultados Parciales'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opciones.map((opcion) => {
                const porcentaje = totalVotos > 0 ? ((opcion.votos_count || 0) / totalVotos * 100) : 0;
                const esGanador = votacionCerrada && opcion.id === ganador?.id && totalVotos > 0;
                return (
                  <div key={opcion.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className={esGanador ? 'font-bold text-primary' : ''}>
                        {esGanador && <CheckCircle className="inline h-4 w-4 mr-1" />}
                        {opcion.nombre}
                        {userVote === opcion.id && <span className="text-xs ml-2">(tu voto)</span>}
                      </span>
                      <span className="text-muted-foreground">{opcion.votos_count || 0} ({porcentaje.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${esGanador ? 'bg-primary' : 'bg-primary/50'}`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Total: {totalVotos} votos
              </p>

              {/* Export CSV - solo creador y cerrada */}
              {isCreator && votacionCerrada && votos.length > 0 && (
                <Button variant="outline" className="w-full mt-3" onClick={exportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Reporte CSV
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mensaje de acceso restringido por geografía */}
        {!canVote && user && votacion.tipo === 'abierta' && !votacionCerrada && (
          <Card className="border-destructive/50">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-sm text-destructive font-medium">No puedes votar en esta votación</p>
              <p className="text-xs text-muted-foreground mt-1">{accessMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Votar (si no ha votado, no está cerrada y tiene acceso) */}
        {!userVote && !votacionCerrada && user && canVote && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Emitir Voto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={selectedOpcion} onValueChange={setSelectedOpcion}>
                {opciones.map((opcion) => (
                  <div key={opcion.id} className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value={opcion.id} id={opcion.id} />
                    <Label htmlFor={opcion.id} className="cursor-pointer flex-1">{opcion.nombre}</Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="space-y-2">
                <Label htmlFor="observacion">Observación (opcional)</Label>
                <Textarea
                  id="observacion"
                  placeholder="Algún comentario sobre tu voto..."
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  rows={2}
                />
              </div>

              <Button 
                className="w-full" 
                disabled={!selectedOpcion || voting}
                onClick={handleVote}
              >
                {voting ? 'Votando...' : 'Confirmar Voto'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* No puede votar - no autenticado */}
        {!user && !votacionCerrada && (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Debes iniciar sesión para votar</p>
              <Button className="mt-3" onClick={() => navigate('/auth')}>
                Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Miembros y Compartir (solo si es cerrada y creador) */}
        {votacion.tipo === 'cerrada' && isCreator && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Miembros ({miembros.length})
                </CardTitle>
                <div className="flex gap-1">
                  {/* Botón compartir por WhatsApp */}
                  <Button size="sm" variant="outline" onClick={shareViaWhatsApp} className="text-green-600">
                    <Share2 className="h-4 w-4 mr-1" />
                    WhatsApp
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <UserPlus className="h-4 w-4 mr-1" />
                        Invitar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invitar Miembro</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* Link de invitación */}
                        <div className="space-y-2">
                          <Label>Link de invitación</Label>
                          <div className="flex gap-2">
                            <Input value={inviteLink} readOnly className="text-xs" />
                            <Button size="icon" variant="outline" onClick={copyInviteLink}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Comparte este link para que otros puedan unirse
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={shareViaWhatsApp}>
                            <Share2 className="h-4 w-4 mr-2" />
                            Enviar por WhatsApp
                          </Button>
                        </div>

                        <div className="border-t pt-4 space-y-2">
                          <Label>O buscar por teléfono</Label>
                          <Input
                            placeholder="Ej: +52 1234567890"
                            value={invitePhone}
                            onChange={(e) => setInvitePhone(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            El usuario debe estar registrado en la app
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancelar</Button>
                        </DialogClose>
                        <Button onClick={handleInvite} disabled={inviting || !invitePhone.trim()}>
                          {inviting ? 'Invitando...' : 'Agregar'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {miembros.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay miembros aún. Comparte el link por WhatsApp o usa "Invitar".
                </p>
              ) : (
                <div className="space-y-2">
                  {miembros.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.profile?.nombre || 'Usuario'}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.profile?.telefono ? `***${m.profile.telefono.slice(-3)}` : 'Sin teléfono'}
                        </p>
                      </div>
                      {m.user_id === votacion.creador_id && (
                        <Badge variant="outline" className="text-xs">Creador</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Votación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={editDescripcion}
                onChange={(e) => setEditDescripcion(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de cierre</Label>
              <Input
                type="datetime-local"
                value={editFechaFin}
                onChange={(e) => setEditFechaFin(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NavigationBar />
    </div>
  );
}
