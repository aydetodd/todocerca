import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowRight, Search, Users, ShoppingCart, Package, Wrench } from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const categories = [
    { name: "Servicios", icon: Wrench, color: "bg-blue-100 text-blue-800", count: "120+" },
    { name: "Productos", icon: Package, color: "bg-green-100 text-green-800", count: "250+" },
    { name: "Comercios", icon: ShoppingCart, color: "bg-purple-100 text-purple-800", count: "85+" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <ShoppingCart className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">ToDoCerca</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/search')}>
              Buscar
            </Button>
            <Button onClick={() => navigate('/auth')}>
              Iniciar Sesión
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="text-center py-20">
          <Badge variant="secondary" className="mb-4">
            Conectando productores locales con consumidores
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Encuentra productos
            <span className="text-primary"> cerca de ti</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Descubre productos frescos y servicios de calidad en tu comunidad. 
            Conecta directamente con proveedores locales.
          </p>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="¿Qué productos buscas? (ej: tomate, frutas, lácteos)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 text-lg"
              />
              <Button type="submit" size="lg" className="h-12 px-8">
                <Search className="h-5 w-5 mr-2" />
                Buscar
              </Button>
            </div>
          </form>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8" onClick={() => navigate('/auth')}>
              Registrarse como Proveedor
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8" onClick={() => navigate('/search')}>
              Explorar productos
            </Button>
          </div>
        </section>

        {/* Categories */}
        <section className="py-16">
          <h3 className="text-3xl font-bold text-center mb-12">
            Explora por Categorías
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {categories.map((category, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/search')}>
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <category.icon className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{category.name}</CardTitle>
                  <CardDescription>
                    Encuentra los mejores {category.name.toLowerCase()} cerca de ti
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Badge variant="secondary" className={category.color}>
                    {category.count} opciones
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-primary text-primary-foreground rounded-lg">
          <div className="text-center px-8">
            <h3 className="text-3xl font-bold mb-4">¿Eres proveedor?</h3>
            <p className="text-xl mb-8 opacity-90">
              Únete a nuestra plataforma y llega a más clientes en tu área
            </p>
            <Button size="lg" variant="secondary" onClick={() => navigate('/auth')}>
              Registrar mi Negocio
            </Button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 TodoCerca. Conectando comunidades locales.</p>
        </div>
      </footer>
    </div>
  );
}