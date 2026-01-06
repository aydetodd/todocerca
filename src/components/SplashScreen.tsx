import { useEffect, useState } from 'react';
import splashIcon from '@/assets/todocerca-splash-icon.png';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    // Iniciar animación de shrink después de 0.5 segundos
    const shrinkTimer = setTimeout(() => {
      setShrink(true);
    }, 500);

    // Iniciar fade out después de 2 segundos
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 2000);

    // Completar después de 2.5 segundos (2s + 0.5s animación)
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(shrinkTimer);
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
      <div className="flex flex-col items-center justify-center">
        <img 
          src={splashIcon} 
          alt="TodoCerca" 
          className={`transition-all duration-1000 ease-out ${
            shrink 
              ? 'w-[20vw] h-[20vw] max-w-[20vh] max-h-[20vh]' 
              : 'w-[80vw] h-[80vw] max-w-[80vh] max-h-[80vh]'
          }`}
        />
        <p className={`text-lg text-muted-foreground mt-6 transition-opacity duration-500 ${
          shrink ? 'opacity-100' : 'opacity-0'
        }`}>
          Encuentra todo cerca de ti
        </p>
      </div>
    </div>
  );
};
