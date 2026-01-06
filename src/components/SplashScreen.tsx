import { useEffect, useState } from 'react';
import splashIcon from '@/assets/todocerca-splash-icon.png';

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

    // Completar después de 2.5 segundos
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
      <img 
        src={splashIcon} 
        alt="TodoCerca" 
        className="w-[70vw] h-[70vw] max-w-[70vh] max-h-[70vh]"
      />
    </div>
  );
};
