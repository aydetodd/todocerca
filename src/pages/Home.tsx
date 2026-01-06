import { useState } from 'react';
import UserRegistryReport from '@/components/UserRegistryReport';

// Esta página ahora solo renderiza un placeholder vacío mientras
// el SplashHandler en AppWrapper maneja la redirección
export default function Home() {
  const [clickSequence, setClickSequence] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);

  const handleSecretClick = (letter: string) => {
    const newSequence = [...clickSequence, letter];
    
    if (newSequence.join('') === 'VOA') {
      setShowReport(true);
      setClickSequence([]);
    } else if ('VOA'.startsWith(newSequence.join(''))) {
      setClickSequence(newSequence);
    } else {
      setClickSequence([]);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {/* Esta página está vacía porque el SplashScreen se muestra encima */}
      {/* El contenido secreto del footer se mantiene para el easter egg */}
      <div className="hidden">
        <span onClick={() => handleSecretClick('V')}>v</span>
        <span onClick={() => handleSecretClick('O')}>o</span>
        <span onClick={() => handleSecretClick('A')}>a</span>
      </div>
      <UserRegistryReport open={showReport} onOpenChange={setShowReport} />
    </div>
  );
}
