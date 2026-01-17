import { useState } from 'react';
import { AlertTriangle, X, Phone, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSOS } from '@/hooks/useSOS';
import { cn } from '@/lib/utils';

interface SOSButtonProps {
  className?: string;
}

export const SOSButton = ({ className }: SOSButtonProps) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActive, setShowActive] = useState(false);
  const { activeAlert, loading, sending, activateSOS, cancelSOS, getShareLink, contactCount } = useSOS();

  const handlePress = () => {
    if (activeAlert) {
      setShowActive(true);
    } else {
      setShowConfirm(true);
    }
  };

  const handleConfirmSOS = async () => {
    setShowConfirm(false);
    const success = await activateSOS();
    if (success) {
      setShowActive(true);
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

  return (
    <>
      {/* Botón SOS Flotante */}
      <button
        onClick={handlePress}
        disabled={loading}
        className={cn(
          "fixed z-50 rounded-full shadow-2xl transition-all duration-300",
          "flex items-center justify-center",
          "active:scale-95 hover:scale-105",
          activeAlert
            ? "bg-destructive animate-pulse w-20 h-20"
            : "bg-destructive hover:bg-destructive/90 w-16 h-16",
          className
        )}
        style={{
          bottom: '100px',
          right: '16px',
        }}
        aria-label="Botón SOS de emergencia"
      >
        {loading ? (
          <Loader2 className="h-8 w-8 text-destructive-foreground animate-spin" />
        ) : (
          <span className="text-destructive-foreground font-bold text-lg">
            SOS
          </span>
        )}
      </button>

      {/* Diálogo de Confirmación */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              ¿Activar SOS?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Esto enviará una alerta de emergencia con tu ubicación a{' '}
                <strong>{contactCount} contacto(s)</strong> de confianza.
              </p>
              {contactCount === 0 && (
                <p className="text-destructive text-sm">
                  ⚠️ No tienes contactos de confianza configurados. Ve a tu perfil para agregar contactos.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Tu ubicación se compartirá durante 30 minutos máximo.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSOS}
              className="bg-destructive hover:bg-destructive/90"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-2" />
              )}
              Confirmar SOS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                Tu alerta de emergencia está activa. Tus contactos pueden ver tu ubicación.
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
