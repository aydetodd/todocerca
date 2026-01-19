import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Phone, Share2, Loader2, Users, Trash2, Copy, Check, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { useSOS } from '@/hooks/useSOS';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SOSButtonProps {
  className?: string;
}

const HOLD_DURATION = 3000; // 3 segundos para activar

export const SOSButton = ({ className }: SOSButtonProps) => {
  const [showActive, setShowActive] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasActivatedRef = useRef(false);
  
  const { activeAlert, loading, activateSOS, cancelSOS, getShareLink, sosContactCount } = useSOS();
  const { contacts, loading: loadingContacts, refresh: refreshContacts, toggleSOSTrusted, sosContacts } = useContacts();
  const { user } = useAuth();
  const { toast } = useToast();

  // Generar enlace para compartir
  useEffect(() => {
    const generateShareLink = async () => {
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_token')
        .eq('user_id', user.id)
        .single();
      
      if (profile?.contact_token) {
        setShareLink(`${window.location.origin}/agregar-contacto?token=${profile.contact_token}`);
      }
    };
    
    if (showConfig) {
      generateShareLink();
    }
  }, [showConfig, user]);

  // Limpiar animación al desmontar
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Actualizar progreso mientras se mantiene presionado
  const updateProgress = useCallback(() => {
    if (!holdStartRef.current || hasActivatedRef.current) return;

    const elapsed = Date.now() - holdStartRef.current;
    const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
    setHoldProgress(progress);

    if (progress >= 100 && !hasActivatedRef.current) {
      hasActivatedRef.current = true;
      setIsHolding(false);
      handleActivateSOS();
      return;
    }

    if (holdStartRef.current && !hasActivatedRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const handleActivateSOS = async () => {
    const success = await activateSOS();
    if (success) {
      setShowActive(true);
    }
    setHoldProgress(0);
    holdStartRef.current = null;
    hasActivatedRef.current = false;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    
    if (activeAlert) {
      setShowActive(true);
      return;
    }
    
    if (loading) return;

    hasActivatedRef.current = false;
    holdStartRef.current = Date.now();
    setIsHolding(true);
    setHoldProgress(0);
    animationFrameRef.current = requestAnimationFrame(updateProgress);
  };

  const handlePointerUp = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    const wasHolding = isHolding;
    const holdDuration = holdStartRef.current ? Date.now() - holdStartRef.current : 0;
    
    setIsHolding(false);
    
    // Si no llegó al 100% y fue un click corto (menos de 300ms), abrir configuración
    if (!hasActivatedRef.current) {
      if (holdDuration < 300 && wasHolding && !activeAlert) {
        setShowConfig(true);
      }
      setHoldProgress(0);
      holdStartRef.current = null;
    }
  };

  const handlePointerLeave = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsHolding(false);
    if (!hasActivatedRef.current) {
      setHoldProgress(0);
      holdStartRef.current = null;
    }
  };

  const handleCancelSOS = async () => {
    await cancelSOS();
    setShowActive(false);
  };

  const handleShareWhatsApp = () => {
    if (!getShareLink) return;
    const link = getShareLink();
    const message = encodeURIComponent(
      `🆘 ¡EMERGENCIA! Necesito ayuda.\n\n📍 Ver mi ubicación en tiempo real:\n${link}\n\n📞 Por favor llámame o ven a ayudarme.`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleCall = () => {
    window.location.href = 'tel:911';
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast({ title: 'Enlace copiado', description: 'Comparte el enlace para que te agreguen como contacto' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: 'Error', description: 'No se pudo copiar el enlace', variant: 'destructive' });
    }
  };

  const handleShareInvite = () => {
    if (!shareLink) return;
    const message = encodeURIComponent(
      `¡Hola! Te invito a ser parte de mi círculo de auxilio en TodoCerca. Si activo una alerta SOS, recibirás mi ubicación en tiempo real.\n\nÚnete aquí: ${shareLink}`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleRemoveContact = async (contactId: string) => {
    const { error } = await supabase
      .from('user_contacts')
      .delete()
      .eq('id', contactId);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudo eliminar el contacto', variant: 'destructive' });
    } else {
      toast({ title: 'Contacto eliminado', description: 'Ya no recibirá tus alertas SOS' });
      refreshContacts();
    }
  };

  // Calcular el ángulo para el borde circular de progreso
  const circumference = 2 * Math.PI * 36; // radio de 36px
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  return (
    <>
      {/* Botón SOS Flotante con indicador de progreso circular */}
      <div
        className={cn(
          "fixed z-50",
          className
        )}
        style={{
          bottom: '100px',
          right: '16px',
        }}
      >
        {/* Círculo de progreso SVG */}
        <svg 
          className="absolute inset-0 pointer-events-none"
          width="80" 
          height="80"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Fondo del círculo */}
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="4"
          />
          {/* Progreso */}
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-75"
          />
        </svg>

        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
          disabled={loading}
          className={cn(
            "rounded-full shadow-2xl transition-all duration-300",
            "flex items-center justify-center select-none touch-none",
            "w-20 h-20",
            activeAlert
              ? "bg-destructive animate-pulse"
              : isHolding
                ? "bg-destructive scale-110"
                : "bg-destructive hover:bg-destructive/90 active:scale-95"
          )}
          aria-label="Click para configurar, mantén 3 segundos para activar SOS"
        >
          {loading ? (
            <Loader2 className="h-8 w-8 text-destructive-foreground animate-spin" />
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-destructive-foreground font-bold text-lg">
                SOS
              </span>
              {!activeAlert && !isHolding && (
                <span className="text-destructive-foreground/70 text-[9px] leading-tight">
                  {sosContactCount > 0 ? `${sosContactCount} auxilio${sosContactCount > 1 ? 's' : ''}` : 'Configurar'}
                </span>
              )}
              {isHolding && (
                <span className="text-destructive-foreground text-xs font-medium">
                  {Math.ceil((HOLD_DURATION - (holdProgress / 100) * HOLD_DURATION) / 1000)}s
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Drawer de Configuración de Contactos de Auxilio */}
      <Drawer open={showConfig} onOpenChange={setShowConfig}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-destructive" />
              Círculo de Auxilio
            </DrawerTitle>
            <DrawerDescription>
              Estas personas recibirán tu ubicación cuando actives el SOS
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 pb-6 space-y-4">
            {/* Lista de contactos actuales */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Contactos ({contacts.length}) · 
                <span className="text-destructive font-semibold"> {sosContacts.length} reciben SOS</span>
              </h4>
              
              {loadingContacts ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No tienes contactos de auxilio</p>
                  <p className="text-xs">Invita a familiares o amigos</p>
                </div>
              ) : (
                <ScrollArea className="max-h-48">
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div 
                        key={contact.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg transition-colors",
                          contact.is_sos_trusted 
                            ? "bg-destructive/10 border border-destructive/30" 
                            : "bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
                            contact.is_sos_trusted ? "bg-destructive/20" : "bg-primary/10"
                          )}>
                            <span className={cn(
                              "font-medium",
                              contact.is_sos_trusted ? "text-destructive" : "text-primary"
                            )}>
                              {(contact.nickname || contact.apodo || contact.nombre || 'C')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium block truncate">
                              {contact.nickname || contact.apodo || contact.nombre || 'Contacto'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {contact.is_sos_trusted ? '🔔 Recibe alertas' : '🔕 No recibe alertas'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Switch para activar/desactivar SOS */}
                          <div className="flex items-center gap-1.5">
                            {contact.is_sos_trusted ? (
                              <Bell className="h-4 w-4 text-destructive" />
                            ) : (
                              <BellOff className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Switch
                              checked={contact.is_sos_trusted}
                              onCheckedChange={(checked) => {
                                toggleSOSTrusted(contact.id, checked);
                                toast({
                                  title: checked ? "Contacto de auxilio activado" : "Contacto de auxilio desactivado",
                                  description: checked 
                                    ? `${contact.nickname || contact.apodo || contact.nombre} recibirá tus alertas SOS`
                                    : `${contact.nickname || contact.apodo || contact.nombre} ya no recibirá alertas SOS`,
                                });
                              }}
                            />
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveContact(contact.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Invitar nuevos contactos */}
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-medium">Invitar contactos</h4>
              
              <Button
                variant="default"
                className="w-full justify-start bg-green-600 hover:bg-green-700"
                onClick={handleShareInvite}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Invitar por WhatsApp
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-600" />
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar enlace de invitación
                  </>
                )}
              </Button>
            </div>

            {/* Instrucciones */}
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">¿Cómo funciona?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Mantén presionado el botón SOS por 3 segundos para activar</li>
                <li>Tus contactos recibirán tu ubicación en tiempo real</li>
                <li>La alerta dura máximo 30 minutos</li>
              </ul>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Diálogo de Alerta Activa */}
      <AlertDialog open={showActive} onOpenChange={setShowActive}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <div className="relative">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full animate-ping" />
              </div>
              SOS Activo
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Tu alerta de emergencia está activa. Tus <strong>{sosContactCount} contacto(s)</strong> de auxilio pueden ver tu ubicación.
              </p>
              
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleCall}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Llamar al 911
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full justify-start text-green-600 border-green-600 hover:bg-green-50"
                  onClick={handleShareWhatsApp}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Compartir por WhatsApp
                </Button>

                {sosContactCount === 0 && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-primary"
                    onClick={() => {
                      setShowActive(false);
                      setShowConfig(true);
                    }}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Agregar contactos de auxilio
                  </Button>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => setShowActive(false)}
              className="w-full sm:w-auto"
            >
              Cerrar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSOS}
              className="w-full sm:w-auto"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar SOS
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
