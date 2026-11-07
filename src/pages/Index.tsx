import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Users, ShoppingCart, Package, Wrench } from 'lucide-react';
import heroBackground from '@/assets/hero-gradient-background.jpg';
import { BrandIcon } from '@/components/BrandIcon';

export default function Index() {
  const categories = [
    { name: "Servicios", icon: Wrench, count: "120+" },
    { name: "Productos", icon: Package, count: "250+" },
    { name: "Comercios", icon: ShoppingCart, count: "85+" },
  ];
  const go = (p: string) => window.location.assign(p);

  return (
    <div className="landing-premium min-h-screen">
      <header className="sticky top-0 z-20 bg-secondary text-secondary-foreground shadow-md">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <BrandIcon className="h-9 w-9 shrink-0" />
            <span className="text-lg sm:text-xl font-bold tracking-tight">ToDoCerca</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 ml-auto">
            <Link to="/comparativa" className="text-xs sm:text-sm font-semibold text-secondary-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-4 hover:text-primary transition-all duration-300 px-1 sm:px-2 whitespace-nowrap">
              ¿Por qué elegir TodoCerca?
            </Link>
            <Button size="sm" className="lp-btn-primary rounded-full px-4" onClick={() => go('/auth')}>
              Iniciar Sesión
            </Button>
          </div>
        </div>
      </header>

      <section className="relative text-center py-28 md:py-36 bg-cover bg-center" style={{ backgroundImage: `url(${heroBackground})` }}>
        <div className="absolute inset-0 bg-gradient-to-r from-secondary/90 via-secondary/60 to-secondary/10" />
        <div className="relative z-10 container mx-auto px-4">
          <span className="inline-block mb-5 rounded-full border border-secondary-foreground/30 bg-secondary-foreground/10 px-4 py-1 text-sm text-secondary-foreground backdrop-blur">
            Conectando productores locales con consumidores
          </span>
          <h1 className="lp-hero-text text-4xl md:text-6xl font-bold mb-6 text-secondary-foreground tracking-tight">
            Conectamos con tu comunidad
          </h1>
          <p className="lp-hero-text text-lg md:text-xl text-secondary-foreground/95 mb-10 max-w-2xl mx-auto">
            La plataforma líder para encontrar proveedores confiables y hacer crecer tu negocio
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-xl mx-auto">
            <Button size="lg" className="lp-btn-primary rounded-xl text-base px-8 w-full sm:w-auto" onClick={() => go('/auth')}>
              <Package className="mr-2 h-5 w-5" /> Registrar como Proveedor
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl text-base px-8 w-full sm:w-auto bg-card border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300" onClick={() => go('/buscar-transporte')}>
              <Users className="mr-2 h-5 w-5" /> Buscar transporte
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 border-b border-border">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-3 text-[hsl(var(--lp-heading))]">Explora por Categorías</h2>
          <p className="text-center mb-12 text-[hsl(var(--lp-text))]">Todo lo que necesitas, cerca de ti</p>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {categories.map((c) => (
              <button key={c.name} type="button" className="lp-card p-8 text-center" onClick={() => go('/search')}>
                <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <c.icon className="lp-icon h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-[hsl(var(--lp-sub))]">{c.name}</h3>
                <p className="text-sm mb-4 text-[hsl(var(--lp-text))]">Encuentra los mejores {c.name.toLowerCase()} cerca de ti</p>
                <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-[hsl(var(--lp-heading))]">{c.count} opciones</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="lp-card text-center px-6 py-14 hover:transform-none">
            <h2 className="text-3xl font-bold mb-4 text-[hsl(var(--lp-heading))]">¿Eres proveedor?</h2>
            <p className="text-lg mb-8 text-[hsl(var(--lp-text))]">Únete a nuestra plataforma y llega a más clientes en tu área</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="lp-btn-primary rounded-xl px-8" onClick={() => go('/auth')}>Registrar mi empresa (Persona Moral)</Button>
              <Button size="lg" variant="outline" className="rounded-xl px-8 border-primary text-primary" onClick={() => go('/auth')}>Registrarme como persona física</Button>
            </div>
            <p className="mt-4 text-sm text-[hsl(var(--lp-text))]">Empresa: RFC + e.firma del representante legal. Persona física: CURP e INE.</p>
          </div>
        </div>
      </section>

      <footer className="bg-secondary py-10">
        <div className="container mx-auto px-4 text-center text-[hsl(var(--lp-footer-text))]">
          <div className="mb-3 flex flex-col gap-1">
            <Link to="/comparativa" className="text-secondary-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-4 hover:text-primary transition-all duration-300">¿Por qué elegir TodoCerca?</Link>
            <Link to="/comparativa" className="text-secondary-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-4 hover:text-primary transition-all duration-300">Comparativa</Link>
          </div>
          <p className="text-sm text-[hsl(var(--lp-footer-text))]">&copy; 2026 TodoCerca. Conectando comunidades locales.</p>
        </div>
      </footer>
    </div>
  );
}
