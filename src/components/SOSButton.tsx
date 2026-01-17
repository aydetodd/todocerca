import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Phone, Share2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSOS } from '@/hooks/useSOS';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface SOSButtonProps {
  className?: string;
}

const HOLD_DURATION = 3000; // 3 segundos para activar

export const SOSButton = ({ className }: SOSButtonProps) => {
  const [showActive, setShowActive] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasActivatedRef = useRef(false);
  const navigate = useNavigate();
  
  const { activeAlert, loading, activateSOS, cancelSOS, getShareLink, contactCount } = useSOS();

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
    
    setIsHolding(false);
    
    // Si no llegó al 100%, resetear
    if (!hasActivatedRef.current) {
      setHoldProgress(0);
      holdStartRef.current = null;
    }
  };

  const handlePointerLeave = () => {
    handlePointerUp();
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

  const handleGoToContacts = () => {
    navigate('/mi-perfil');
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
          aria-label="Mantén presionado 3 segundos para activar SOS"
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
                  Mantén 3s
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
                Tu alerta de emergencia está activa. Tus <strong>{contactCount} contacto(s)</strong> de auxilio pueden ver tu ubicación.
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

                {contactCount === 0 && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-primary"
                    onClick={handleGoToContacts}
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
