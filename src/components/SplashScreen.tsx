import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Iniciar fade out después de 2 segundos
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 2000);

    // Completar después de 2.5 segundos (2s + 0.5s animación)
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div 
      className={`fixed inset-0 bg-background flex flex-col items-center justify-center z-50 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center animate-pulse">
        <MapPin className="h-[70vw] w-[70vw] max-h-[70vh] max-w-[70vh] text-primary" />
        <h1 className="text-4xl md:text-6xl font-bold text-foreground mt-4">TodoCerca</h1>
      </div>
    </div>
  );
};
