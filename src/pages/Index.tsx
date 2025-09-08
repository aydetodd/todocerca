import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Users, Package, Wrench, ShoppingCart } from "lucide-react";

const Index = () => {
  const categories = [
    { name: "Servicios", icon: Wrench, color: "bg-blue-100 text-blue-800", count: "120+" },
    { name: "Productos", icon: Package, color: "bg-green-100 text-green-800", count: "250+" },
    { name: "Comercios", icon: ShoppingCart, color: "bg-purple-100 text-purple-800", count: "85+" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MapPin className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">TodoCerca</h1>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => window.location.href = "/auth"}>
              Iniciar Sesión
            </Button>
            <Button onClick={() => window.location.href = "/auth"}>
              Registrarse
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-primary/5 to-secondary/5">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-5xl font-bold text-foreground mb-6">
            Encuentra todo lo que necesitas <span className="text-primary">cerca de ti</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Conectamos a clientes con proveedores locales. Descubre servicios, productos y comercios en tu área.
          </p>
          
          {/* Search Bar */}
          <div className="max-w-md mx-auto mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input 
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground"
                placeholder="¿Qué estás buscando?"
              />
              <Button className="absolute right-1 top-1 bottom-1">Buscar</Button>
            </div>
          </div>

          <div className="flex justify-center items-center space-x-4 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>+500 usuarios registrados</span>
            <span>•</span>
            <MapPin className="h-4 w-4" />
            <span>Cobertura local</span>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h3 className="text-3xl font-bold text-center text-foreground mb-12">
            Explora por Categorías
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {categories.map((category, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-3xl font-bold mb-4">¿Eres proveedor?</h3>
          <p className="text-xl mb-8 opacity-90">
            Únete a nuestra plataforma y llega a más clientes en tu área
          </p>
          <Button size="lg" variant="secondary">
            Registrar mi Negocio
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 TodoCerca. Conectando comunidades locales.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
