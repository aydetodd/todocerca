import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Settings, ChevronRight, CheckCircle } from 'lucide-react';
import { BackgroundGeolocation } from '@/integrations/capacitor/backgroundGeolocation';

// Key para localStorage - recordar si ya configuró los permisos
const PERMISSION_CONFIGURED_KEY = 'bg_location_permission_configured';

interface LocationPermissionGuideProps {
  open: boolean;
  onClose: () => void;
}

export const LocationPermissionGuide = ({ open, onClose }: LocationPermissionGuideProps) => {
  const [step, setStep] = useState(1);

  const handleOpenSettings = () => {
    if (Capacitor.isNativePlatform()) {
      BackgroundGeolocation.openSettings();
    }
    setStep(2);
  };

  // Cuando el usuario dice "Listo, ya lo configuré" - marcar como configurado
  const handleDone = () => {
    localStorage.setItem(PERMISSION_CONFIGURED_KEY, 'true');
    setStep(1);
    onClose();
  };

  // "Ahora no" - cerrar sin marcar como configurado (verá el aviso de nuevo)
  const handleLater = () => {
    setStep(1);
    onClose();
  };

  useEffect(() => {
    if (open) {
      setStep(1);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleLater()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Permiso de Ubicación en Background
          </DialogTitle>
          <DialogDescription>
            Para rastrear tu ubicación con la pantalla apagada, necesitas activar "Permitir todo el tiempo"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 1 ? (
            <>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">¿Por qué es necesario?</h4>
                <p className="text-sm text-muted-foreground">
                  Android solo permite rastrear ubicación con pantalla apagada si activas <strong>"Permitir todo el tiempo"</strong> en los ajustes de la app.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Pasos a seguir:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>Toca el botón "Abrir Ajustes" abajo</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>Selecciona <strong>"Permitir todo el tiempo"</strong></span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>Regresa a la app y listo</span>
                  </div>
                </div>
              </div>

              <Button onClick={handleOpenSettings} className="w-full gap-2">
                <Settings className="h-4 w-4" />
                Abrir Ajustes de Ubicación
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button variant="ghost" onClick={handleLater} className="w-full text-muted-foreground">
                Ahora no (se mostrará de nuevo)
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <div className="text-center space-y-2">
                  <h4 className="font-medium">¿Ya activaste el permiso?</h4>
                  <p className="text-sm text-muted-foreground">
                    Si seleccionaste "Permitir todo el tiempo", el rastreo en background ya está funcionando.
                  </p>
                </div>
              </div>

              <Button onClick={handleDone} className="w-full">
                Listo, ya lo configuré
              </Button>

              <Button variant="outline" onClick={() => setStep(1)} className="w-full">
                Ver instrucciones de nuevo
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Función helper para verificar si ya se configuró
export const isPermissionConfigured = () => {
  return localStorage.getItem(PERMISSION_CONFIGURED_KEY) === 'true';
};

// Función para resetear (útil si hay error de permisos)
export const resetPermissionConfigured = () => {
  localStorage.removeItem(PERMISSION_CONFIGURED_KEY);
};
