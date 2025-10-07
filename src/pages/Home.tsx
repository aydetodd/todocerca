import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { MapPin, Package, Users, Zap } from 'lucide-react';
import UserRegistryReport from '@/components/UserRegistryReport';

export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [clickSequence, setClickSequence] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <MapPin className="h-8 w-8 text-amber-500" />
            <h1 className="text-2xl font-bold text-gray-900">TodoCerca</h1>
          </div>
          <Button onClick={() => navigate('/auth')} className="bg-amber-500 hover:bg-amber-600">
            Iniciar Sesión
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Encuentra productos y servicios cerca de ti
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Conecta con proveedores locales en tiempo real. Compra productos frescos, contrata servicios y apoya a tu comunidad.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/auth')}
            className="bg-amber-500 hover:bg-amber-600 text-lg px-8 py-6"
          >
            Comenzar Ahora
          </Button>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <MapPin className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Ubicación en Tiempo Real</h3>
            <p className="text-gray-600">
              Ve la ubicación exacta de los proveedores cerca de ti en un mapa interactivo.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <Package className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Productos Locales</h3>
            <p className="text-gray-600">
              Descubre productos frescos y servicios de calidad en tu área.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
              <Users className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Comunicación Directa</h3>
            <p className="text-gray-600">
              Chatea directamente con proveedores para consultar y coordinar.
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-lg shadow-lg p-8 mt-16 text-center max-w-2xl mx-auto">
          <Zap className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-4">¿Eres proveedor?</h3>
          <p className="text-gray-600 mb-6">
            Registra tu negocio y comienza a vender tus productos o servicios a miles de clientes potenciales.
          </p>
          <Button 
            size="lg"
            onClick={() => navigate('/auth')}
            className="bg-amber-500 hover:bg-amber-600"
          >
            Registrar mi Negocio
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-gray-600">
          <p>
            © 2025 TodoCerca. Todos los derechos reser
            <span onClick={() => handleSecretClick('V')} className="cursor-default select-none">v</span>
            <span onClick={() => handleSecretClick('O')} className="cursor-default select-none">o</span>
            d
            <span onClick={() => handleSecretClick('A')} className="cursor-default select-none">a</span>
            s.
          </p>
        </div>
      </footer>

      <UserRegistryReport open={showReport} onOpenChange={setShowReport} />
    </div>
  );
}
